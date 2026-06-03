/*
    Option 2 (active): create DB role and grant report view access to the role.
    Option 1 (preferred): create SQL login [report] + mapped user (kept below, commented out).
*/

USE [FLDSyncboardDB];
GO

DECLARE @targetPrincipal SYSNAME = NULL;
DECLARE @reportRole SYSNAME = N'report_view_readers';
-- Optional: set an explicit existing DB principal to add to the role.
-- Example: DECLARE @targetPrincipal SYSNAME = N'MAGNA\some_user';

DECLARE @sql NVARCHAR(MAX);

IF NOT EXISTS (
    SELECT 1 FROM sys.database_principals
    WHERE name = @reportRole AND type = 'R'
)
BEGIN
    SET @sql = N'CREATE ROLE [' + REPLACE(@reportRole, N']', N']]') + N'];';
    EXEC(@sql);
END;

SET @sql = N'GRANT SELECT ON OBJECT::dbo.vw_report_stations TO [' + REPLACE(@reportRole, N']', N']]') + N'];';
EXEC(@sql);

SET @sql = N'GRANT SELECT ON OBJECT::dbo.vw_report_lines TO [' + REPLACE(@reportRole, N']', N']]') + N'];';
EXEC(@sql);

SET @sql = N'GRANT SELECT ON OBJECT::dbo.vw_report_shifts TO [' + REPLACE(@reportRole, N']', N']]') + N'];';
EXEC(@sql);

SET @sql = N'GRANT SELECT ON OBJECT::dbo.vw_report_shift_assignments TO [' + REPLACE(@reportRole, N']', N']]') + N'];';
EXEC(@sql);

SET @sql = N'GRANT SELECT ON OBJECT::dbo.vw_report_masterdata_templates TO [' + REPLACE(@reportRole, N']', N']]') + N'];';
EXEC(@sql);

SET @sql = N'GRANT SELECT ON OBJECT::dbo.vw_report_sql_integrity TO [' + REPLACE(@reportRole, N']', N']]') + N'];';
EXEC(@sql);

IF @targetPrincipal IS NOT NULL
BEGIN
    IF @targetPrincipal = SUSER_SNAME()
    BEGIN
        PRINT 'OPTION_2_NOTE: target principal equals current execution principal; skipping role membership change.';
    END
    ELSE IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @targetPrincipal)
    BEGIN
        BEGIN TRY
            SET @sql = N'ALTER ROLE [' + REPLACE(@reportRole, N']', N']]') + N'] ADD MEMBER [' + REPLACE(@targetPrincipal, N']', N']]') + N'];';
            EXEC(@sql);
        END TRY
        BEGIN CATCH
            PRINT 'OPTION_2_NOTE: role membership update skipped.';
            SELECT ERROR_NUMBER() AS error_number, ERROR_MESSAGE() AS error_message;
        END CATCH;
    END
    ELSE
    BEGIN
        PRINT 'OPTION_2_NOTE: target principal not found in current database; role created and grants applied only.';
    END
END;

SELECT SUSER_SNAME() AS executed_as, @reportRole AS granted_role, ISNULL(@targetPrincipal, N'<none>') AS requested_principal, 'OPTION_2_DONE' AS status;
GO

/*
    Option 1 (preferred, execute later with DBA server-level privileges)

USE [master];
GO
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'report')
BEGIN
        CREATE LOGIN [report]
        WITH PASSWORD = N'report',
                 CHECK_POLICY = OFF,
                 CHECK_EXPIRATION = OFF;
END
GO

USE [FLDSyncboardDB];
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'report')
BEGIN
        CREATE USER [report] FOR LOGIN [report];
END
GO

GRANT SELECT ON OBJECT::dbo.vw_report_stations TO [report];
GRANT SELECT ON OBJECT::dbo.vw_report_lines TO [report];
GRANT SELECT ON OBJECT::dbo.vw_report_shifts TO [report];
GRANT SELECT ON OBJECT::dbo.vw_report_shift_assignments TO [report];
GRANT SELECT ON OBJECT::dbo.vw_report_masterdata_templates TO [report];
GRANT SELECT ON OBJECT::dbo.vw_report_sql_integrity TO [report];
GO
*/
