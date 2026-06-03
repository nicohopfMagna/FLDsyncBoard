/*
  FLD-SyncBoard report access diagnostics and optional provisioning

  Usage:
  1) Open in SSMS.
  2) Set @mode:
     - DIAG:          diagnostics only (safe default)
     - APPLY_FULL:    create login + user + grants (needs server-level rights)
     - APPLY_DB_ONLY: create user + grants for existing login (no CREATE LOGIN)
  3) Execute in target environment.
*/

SET NOCOUNT ON;

DECLARE @targetDb SYSNAME = N'FLDSyncboardDB';
DECLARE @reportLogin SYSNAME = N'report';
DECLARE @reportPassword NVARCHAR(256) = N'report';
DECLARE @mode NVARCHAR(20) = N'DIAG'; -- DIAG | APPLY_FULL | APPLY_DB_ONLY

PRINT '=== REPORT ACCESS DIAGNOSTICS START ===';
PRINT 'Mode: ' + @mode;
PRINT 'Target DB: ' + @targetDb;

/* Server context */
SELECT
  SUSER_SNAME() AS executed_as,
  ORIGINAL_LOGIN() AS original_login,
  SYSTEM_USER AS [system_user];

SELECT
  IS_SRVROLEMEMBER('sysadmin') AS is_sysadmin,
  IS_SRVROLEMEMBER('securityadmin') AS is_securityadmin,
  IS_SRVROLEMEMBER('dbcreator') AS is_dbcreator,
  HAS_PERMS_BY_NAME(NULL, 'SERVER', 'ALTER ANY LOGIN') AS can_alter_any_login,
  HAS_PERMS_BY_NAME(NULL, 'SERVER', 'VIEW ANY DEFINITION') AS can_view_any_definition;

/* Login existence */
SELECT
  sp.name,
  sp.type_desc,
  sp.is_disabled,
  sl.is_policy_checked,
  sl.is_expiration_checked
FROM sys.server_principals sp
LEFT JOIN sys.sql_logins sl ON sl.principal_id = sp.principal_id
WHERE sp.name = @reportLogin;

DECLARE @loginExists BIT = CASE WHEN EXISTS (
  SELECT 1 FROM sys.server_principals WHERE name = @reportLogin
) THEN 1 ELSE 0 END;

/* Optional server-level create login */
IF @mode = N'APPLY_FULL'
BEGIN
  BEGIN TRY
    IF @loginExists = 0
    BEGIN
      DECLARE @sqlCreateLogin NVARCHAR(MAX) =
        N'CREATE LOGIN [' + REPLACE(@reportLogin, N']', N']]') + N'] '
        + N'WITH PASSWORD = N''' + REPLACE(@reportPassword, N'''', N'''''') + N''', '
        + N'CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;';

      EXEC(@sqlCreateLogin);
      PRINT 'APPLY_FULL: login created.';
      SET @loginExists = 1;
    END
    ELSE
    BEGIN
      PRINT 'APPLY_FULL: login already exists, skipping CREATE LOGIN.';
    END
  END TRY
  BEGIN CATCH
    PRINT 'APPLY_FULL: CREATE LOGIN failed.';
    SELECT
      ERROR_NUMBER() AS error_number,
      ERROR_STATE() AS error_state,
      ERROR_MESSAGE() AS error_message;
  END CATCH;
END;

/* DB section */
DECLARE @dbSql NVARCHAR(MAX) = N'
USE ' + QUOTENAME(@targetDb) + N';

DECLARE @reportLoginLocal SYSNAME = @p_report_login;
DECLARE @modeLocal NVARCHAR(20) = @p_mode;

SELECT DB_NAME() AS current_db;

SELECT
  HAS_PERMS_BY_NAME(DB_NAME(), ''DATABASE'', ''CREATE USER'') AS can_create_user,
  HAS_PERMS_BY_NAME(DB_NAME(), ''DATABASE'', ''ALTER ANY USER'') AS can_alter_any_user,
  HAS_PERMS_BY_NAME(DB_NAME(), ''DATABASE'', ''VIEW DEFINITION'') AS can_view_definition;

SELECT name, type_desc
FROM sys.database_principals
WHERE name = @reportLoginLocal;

SELECT name
FROM sys.views
WHERE name IN (
  ''vw_report_stations'',
  ''vw_report_lines'',
  ''vw_report_shifts'',
  ''vw_report_shift_assignments'',
  ''vw_report_masterdata_templates'',
  ''vw_report_sql_integrity''
)
ORDER BY name;

IF @modeLocal IN (''APPLY_FULL'', ''APPLY_DB_ONLY'')
BEGIN
  BEGIN TRY
    IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @reportLoginLocal)
    BEGIN
      DECLARE @sqlCreateUser NVARCHAR(MAX) = N''CREATE USER [''
        + REPLACE(@reportLoginLocal, N'']'', N'']]'' )
        + N''] FOR LOGIN [''
        + REPLACE(@reportLoginLocal, N'']'', N'']]'' )
        + N''];'';

      EXEC(@sqlCreateUser);
      PRINT ''DB APPLY: user created.'';
    END
    ELSE
    BEGIN
      PRINT ''DB APPLY: user already exists, skipping CREATE USER.'';
    END

    DECLARE @grants TABLE (view_name SYSNAME);
    INSERT INTO @grants(view_name)
    VALUES
      (''vw_report_stations''),
      (''vw_report_lines''),
      (''vw_report_shifts''),
      (''vw_report_shift_assignments''),
      (''vw_report_masterdata_templates''),
      (''vw_report_sql_integrity'');

    DECLARE @v SYSNAME;
    DECLARE grant_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT view_name FROM @grants;
    OPEN grant_cursor;
    FETCH NEXT FROM grant_cursor INTO @v;
    WHILE @@FETCH_STATUS = 0
    BEGIN
      IF EXISTS (SELECT 1 FROM sys.views WHERE name = @v)
      BEGIN
        DECLARE @sqlGrant NVARCHAR(MAX) =
          N''GRANT SELECT ON OBJECT::dbo.'' + QUOTENAME(@v)
          + N'' TO ['' + REPLACE(@reportLoginLocal, N'']'', N'']]'' ) + N''];'';
        EXEC(@sqlGrant);
      END
      ELSE
      BEGIN
        PRINT ''DB APPLY: view missing -> '' + @v;
      END

      FETCH NEXT FROM grant_cursor INTO @v;
    END
    CLOSE grant_cursor;
    DEALLOCATE grant_cursor;

    PRINT ''DB APPLY: grants processed.'';
  END TRY
  BEGIN CATCH
    PRINT ''DB APPLY failed.'';
    SELECT
      ERROR_NUMBER() AS error_number,
      ERROR_STATE() AS error_state,
      ERROR_MESSAGE() AS error_message;
  END CATCH;
END;

/* Final summary in DB context */
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @reportLoginLocal) THEN 1 ELSE 0 END AS db_user_exists;

SELECT
  dp.permission_name,
  OBJECT_NAME(dp.major_id) AS object_name
FROM sys.database_permissions dp
INNER JOIN sys.database_principals pr ON pr.principal_id = dp.grantee_principal_id
WHERE pr.name = @reportLoginLocal
  AND dp.permission_name = ''SELECT''
ORDER BY object_name;
';

EXEC sp_executesql
  @dbSql,
  N'@p_report_login SYSNAME, @p_mode NVARCHAR(20)',
  @p_report_login = @reportLogin,
  @p_mode = @mode;

/* Decision helper */
PRINT '=== DECISION GUIDE ===';
IF @mode = N'DIAG'
BEGIN
  PRINT 'If CREATE LOGIN is blocked (Msg 15247), use DBA for APPLY_FULL or switch to APPLY_DB_ONLY with an existing login.';
  PRINT 'If login exists but CREATE USER/GRANT fails, DB role rights are missing in target database.';
END;

PRINT '=== REPORT ACCESS DIAGNOSTICS END ===';
