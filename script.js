// Save all assignments to backend
const API_TOKEN_STORAGE_KEY = 'fld-syncboard-api-token';
const API_REFRESH_TOKEN_STORAGE_KEY = 'fld-syncboard-api-refresh-token';
const API_AUTH_USER_STORAGE_KEY = 'fld-syncboard-auth-user';
const API_AUTH_ROLE_STORAGE_KEY = 'fld-syncboard-auth-role';
const API_AUTH_PERMISSIONS_STORAGE_KEY = 'fld-syncboard-auth-permissions';
const API_AUTH_PROVIDER_STORAGE_KEY = 'fld-syncboard-auth-provider';
const LANG_STORAGE_KEY = 'fld-syncboard-lang';
const DEFAULT_API_TOKEN = 'dev-token';
const DEFAULT_PERMISSIONS = ['user.manage', 'masterdata.read', 'masterdata.write', 'shift.assign', 'system.repair', 'system.health', 'api.catalog.test'];

let knownPermissions = [...DEFAULT_PERMISSIONS];
let authModal = null;
let currentLang = 'de';
let entraConfigPromise = null;
let msalClientPromise = null;

const I18N = {
  pt: {},
  ja: {},
  sk: {},
  tr: {},
  it: {
    masterData: 'Dati principali', masterDataPlantCatalog: 'Catalogo dati base impianto', plantLabel: 'Impianto', templateNameLabel: 'Nome template', templateCatalogLabel: 'Catalogo template (per impianto selezionato)', storeAllToDb: 'Salva tutto nel DB', plantXtotalExport: 'Esporta PlantXtotal', renamePlant: 'Rinomina impianto', plantXtotalHint: 'L\'Excel PlantXtotal include l\'intero ambito dati: stazioni, linee, assegnazioni, colli di bottiglia, tempi ciclo, eventi temporali, modelli turno e assegnazioni turno.', notLoggedIn: 'Non connesso', loginAuth: 'Accesso / Autenticazione', authTitle: 'Autenticazione e gestione utenti', provider: 'Provider', username: 'Nome utente', password: 'Password', oneTimeCode: 'Codice monouso',
    login: 'Accedi', refresh: 'Aggiorna', logout: 'Esci', adminUserMgmt: 'Gestione utenti admin',
    stations: 'Stazioni', lines: 'Linee', assignStationsToLines: 'Assegna stazioni alle linee', timeEvents: 'Eventi temporali', shiftModells: 'Modelli turno', shiftSchedules: 'Piani turno', assignShiftModell: 'Assegna modello turno', apiQuerySimulator: 'Simulatore query API',
    show: 'Mostra', edit: 'Modifica', saveClose: 'Salva/Chiudi', saveAssignments: 'Salva assegnazioni', newLabel: 'Nuovo', importLabel: 'Importa', exportLabel: 'Esporta',
    applyToken: 'Applica token', query: 'Query', runHealthCheck: 'Esegui controllo stato', repairSql: 'Ripara integrita SQL', apiCatalogTester: 'Tester catalogo API', endpoint: 'Endpoint', refreshRecommendations: 'Aggiorna consigli', testApi: 'Test API', result: 'Risultato',
    duration: 'Durata', shiftId: 'ID turno', timeEventDesc: 'Descrizione evento', start: 'Inizio', end: 'Fine', selectShiftModell: 'Seleziona modello turno', selectTarget: 'Seleziona destinazione', stationSingular: 'Stazione', lineSingular: 'Linea', assign: 'Assegna',
    sendTestPointSql: 'Invia punto test a Microsoft SQL', noManagedUsersFound: 'Nessun utente gestito trovato.', grant: 'Concedi', revoke: 'Revoca', deleteLabel: 'Elimina', createUser: 'Crea utente', reload: 'Ricarica',
    darkLabel: 'Scuro', lightLabel: 'Chiaro', stationId: 'ID stazione', lineId: 'ID linea', description: 'Descrizione', bottleneck: 'Collo di bottiglia', cycleTime: 'Tempo ciclo (s)', action: 'Azione'
  },
  hi: {
    masterData: 'मास्टर डेटा', masterDataPlantCatalog: 'प्लांट मास्टर डेटा कैटलॉग', plantLabel: 'प्लांट', templateNameLabel: 'टेम्पलेट नाम', templateCatalogLabel: 'टेम्पलेट कैटलॉग (चयनित प्लांट के लिए)', storeAllToDb: 'सभी डेटा DB में सहेजें', plantXtotalExport: 'PlantXtotal एक्सपोर्ट', renamePlant: 'प्लांट का नाम बदलें', plantXtotalHint: 'PlantXtotal Excel में पूरा डेटा दायरा शामिल है: स्टेशन, लाइन्स, असाइनमेंट, बॉटलनेक मार्क्स, साइकिल टाइम, टाइम इवेंट्स, शिफ्ट मॉडल और शिफ्ट असाइनमेंट।', notLoggedIn: 'लॉग इन नहीं', loginAuth: 'लॉगिन / प्रमाणीकरण', authTitle: 'प्रमाणीकरण और उपयोगकर्ता प्रबंधन', provider: 'प्रदाता', username: 'उपयोगकर्ता नाम', password: 'पासवर्ड', oneTimeCode: 'वन-टाइम कोड',
    login: 'लॉगिन', refresh: 'रिफ्रेश', logout: 'लॉगआउट', adminUserMgmt: 'एडमिन उपयोगकर्ता प्रबंधन',
    stations: 'स्टेशन', lines: 'लाइनें', assignStationsToLines: 'स्टेशन को लाइनों से जोड़ें', timeEvents: 'समय घटनाएँ', shiftModells: 'शिफ्ट मॉडल', shiftSchedules: 'शिफ्ट शेड्यूल', assignShiftModell: 'शिफ्ट मॉडल असाइन करें', apiQuerySimulator: 'API क्वेरी सिम्युलेटर',
    show: 'दिखाएँ', edit: 'संपादित करें', saveClose: 'सहेजें/बंद करें', saveAssignments: 'असाइनमेंट सहेजें', newLabel: 'नया', importLabel: 'इम्पोर्ट', exportLabel: 'एक्सपोर्ट',
    applyToken: 'टोकन लागू करें', query: 'क्वेरी', runHealthCheck: 'हेल्थ चेक चलाएँ', repairSql: 'SQL इंटीग्रिटी ठीक करें', apiCatalogTester: 'API कैटलॉग टेस्टर', endpoint: 'एंडपॉइंट', refreshRecommendations: 'सिफारिशें रिफ्रेश करें', testApi: 'API टेस्ट', result: 'परिणाम',
    duration: 'अवधि', shiftId: 'शिफ्ट ID', timeEventDesc: 'समय घटना विवरण', start: 'प्रारंभ', end: 'समाप्ति', selectShiftModell: 'शिफ्ट मॉडल चुनें', selectTarget: 'लक्ष्य चुनें', stationSingular: 'स्टेशन', lineSingular: 'लाइन', assign: 'असाइन करें',
    sendTestPointSql: 'टेस्ट पॉइंट Microsoft SQL को भेजें', noManagedUsersFound: 'कोई प्रबंधित उपयोगकर्ता नहीं मिला।', grant: 'अनुमति दें', revoke: 'वापस लें', deleteLabel: 'हटाएँ', createUser: 'उपयोगकर्ता बनाएँ', reload: 'रीलोड',
    darkLabel: 'डार्क', lightLabel: 'लाइट', stationId: 'स्टेशन ID', lineId: 'लाइन ID', description: 'विवरण', bottleneck: 'बॉटलनेक', cycleTime: 'साइकिल समय (से.)', action: 'क्रिया'
  },
  hu: {
    masterData: 'Torzsadatok', masterDataPlantCatalog: 'Uzem torzsadat katalogus', plantLabel: 'Uzem', templateNameLabel: 'Sablonnev', templateCatalogLabel: 'Sablonkatalogus (kivalasztott uzemhez)', storeAllToDb: 'Minden mentese az adatbazisba', plantXtotalExport: 'PlantXtotal export', renamePlant: 'Uzem atnevezese', plantXtotalHint: 'A PlantXtotal Excel a teljes adatkorrel rendelkezik: allomasok, vonalak, hozzarendelesek, szuk keresztmetszetek, ciklusidok, idoesemenyek, muszakmodellek es muszakhozzarendelesek.', notLoggedIn: 'Nincs bejelentkezve', loginAuth: 'Belepes / Auth', authTitle: 'Hitelesites es felhasznalokezeles', provider: 'Szolgaltato', username: 'Felhasznalonev', password: 'Jelszo', oneTimeCode: 'Egyszer hasznalatos kod',
    login: 'Belepes', refresh: 'Frissites', logout: 'Kijelentkezes', adminUserMgmt: 'Admin felhasznalokezeles',
    stations: 'Allomasok', lines: 'Vonalak', assignStationsToLines: 'Allomasok hozzarendelese vonalakhoz', timeEvents: 'Idoesemenyek', shiftModells: 'Muszakmodellek', shiftSchedules: 'Muszakbeosztasok', assignShiftModell: 'Muszakmodell hozzarendelese', apiQuerySimulator: 'API lekerdezes szimulator',
    show: 'Megjelenit', edit: 'Szerkeszt', saveClose: 'Mentes/Bezaras', saveAssignments: 'Hozzarendelesek mentese', newLabel: 'Uj', importLabel: 'Import', exportLabel: 'Export',
    applyToken: 'Token alkalmazasa', query: 'Lekerdezes', runHealthCheck: 'Allapotellenorzes futtatasa', repairSql: 'SQL integritas javitasa', apiCatalogTester: 'API katalogus tesztelo', endpoint: 'Vegpont', refreshRecommendations: 'Ajanlasok frissitese', testApi: 'API teszt', result: 'Eredmeny',
    duration: 'Idotartam', shiftId: 'Muszak ID', timeEventDesc: 'Idoesemeny leiras', start: 'Kezdet', end: 'Vege', selectShiftModell: 'Muszakmodell valasztasa', selectTarget: 'Cel valasztasa', stationSingular: 'Allomas', lineSingular: 'Vonal', assign: 'Hozzarendel',
    sendTestPointSql: 'Tesztpont kuldese Microsoft SQL-be', noManagedUsersFound: 'Nem talalhato kezelt felhasznalo.', grant: 'Ad', revoke: 'Visszavon', deleteLabel: 'Torles', createUser: 'Felhasznalo letrehozasa', reload: 'Ujratoltes',
    darkLabel: 'Sotet', lightLabel: 'Vilagos', stationId: 'Allomas ID', lineId: 'Vonal ID', description: 'Leiras', bottleneck: 'Szuk keresztmetszet', cycleTime: 'Ciklusido (s)', action: 'Muvelet'
  },
  en: {
    masterData: 'Master Data',
    masterDataPlantCatalog: 'Master Data Plant Catalog',
    notLoggedIn: 'Not logged in',
    loginAuth: 'Login / Auth',
    authTitle: 'Authentication & User Access Management',
    provider: 'Provider',
    username: 'Username',
    password: 'Password',
    oneTimeCode: 'One-Time Code',
    login: 'Login',
    refresh: 'Refresh',
    logout: 'Logout',
    adminUserMgmt: 'Admin User Management',
    stations: 'Stations',
    lines: 'Lines',
    assignStationsToLines: 'Assign Stations to Lines',
    timeEvents: 'Time Events',
    shiftModells: 'Shift Modells',
    shiftSchedules: 'Shift Assignments',
    assignShiftModell: 'Assign Shift Modell',
    apiQuerySimulator: 'API Query Simulator',
    show: 'Show',
    edit: 'Edit',
    saveClose: 'Save/Close',
    saveAssignments: 'Save Assignments',
    newLabel: 'New',
    importLabel: 'Import',
    exportLabel: 'Export',
    applyToken: 'Apply Token',
    query: 'Query',
    runHealthCheck: 'Run Health Check',
    repairSql: 'Repair SQL Integrity',
    apiCatalogTester: 'API Catalog Tester',
    endpoint: 'Endpoint',
    refreshRecommendations: 'Refresh Recommendations',
    testApi: 'Test API',
    result: 'Result',
    duration: 'Duration',
    shiftId: 'Shift ID',
    timeEventDesc: 'Time Event Desc',
    start: 'Start',
    end: 'End',
    selectShiftModell: 'Select Shift Modell',
    selectTarget: 'Select Target',
    stationSingular: 'Station',
    lineSingular: 'Line',
    assign: 'Assign',
    sendTestPointSql: 'Send Test Point to Microsoft SQL',
    noManagedUsersFound: 'No managed users found.',
    grant: 'Grant',
    revoke: 'Revoke',
    deleteLabel: 'Delete',
    createUser: 'Create User',
    reload: 'Reload',
    darkLabel: 'Dark',
    lightLabel: 'Light',
    stationId: 'Station ID',
    lineId: 'Line ID',
    idLabel: 'ID',
    description: 'Description',
    bottleneck: 'Bottleneck',
    cycleTime: 'Cycle Time (s)',
    action: 'Action',
    yesLabel: 'Yes',
    noLabel: 'No',
    addLabel: 'Add',
    productiveLabel: 'Productive',
    weekdayLabel: 'Weekday',
    shiftName: 'Shift Name',
    timeEvent: 'Time Event',
    targetType: 'Target Type',
    targetIdLabel: 'Target ID',
    targetLabelText: 'Target Label',
    plantLabel: 'Plant',
    templateNameLabel: 'Template Name',
    templateCatalogLabel: 'Template Catalog (for selected Plant)',
    storeAllToDb: 'Store All to DB',
    plantXtotalExport: 'PlantXtotal Export',
    renamePlant: 'Rename Plant',
    plantXtotalHint: 'PlantXtotal Excel includes full data scope: stations, lines, assignments, bottleneck marks, cycle times, time events, shift models, and shift assignments.',
    saveLabel: 'Save',
    cancelLabel: 'Cancel',
    assignedStations: 'Assigned Stations',
    user: 'User',
    role: 'Role',
    enabledLabel: 'Enabled',
    permissionsLabel: 'Permissions',
    grantRevoke: 'Grant/Revoke',
    actions: 'Actions',
    oneTimeCode6: 'One-Time Code (6-digit)',
    newUsername: 'New username',
    permissionsCommaSeparated: 'Permissions comma-separated',
    manualBearerToken: 'Manual Bearer Token',
    stationNumber: 'Station number',
    green: 'Green',
    yellow: 'Yellow',
    red: 'Red',
    healthGreenDesc: 'All APIs and database healthy.',
    healthYellowDesc: 'System is running, but database integrity warnings exist.',
    healthRedDesc: 'One or more APIs or the database are not reachable or have failed.',
    noInputRequired: 'No input required.',
    apiInputFields: 'Input Fields',
    apiOutputFields: 'Output Fields',
    assignmentId: 'Assignment ID',
    templateId: 'Template ID',
    apiDescPatchStation: 'Change station fields (description, bottleneck, cycleTime). Minimum input: id + at least one field.',
    apiDescDeleteStation: 'Delete station by id. Minimum input: id.',
    apiDescPatchLine: 'Change line description. Minimum input: id, description.',
    apiDescDeleteLine: 'Delete line by id. Minimum input: id.',
    apiDescPatchShift: 'Change shift fields. Minimum input: id + one or more fields.',
    apiDescDeleteShift: 'Delete shift by id. Minimum input: id.',
    apiDescGetAssignShift: 'Get all shift assignments. Minimum input: none.',
    apiDescPatchAssignShift: 'Change one shift assignment. Minimum input: id + targetType + targetId.',
    apiDescDeleteAssignShift: 'Delete one shift assignment. Minimum input: id.',
    apiDescDeleteTemplate: 'Delete one masterdata template by id. Minimum input: id.',
    apiHeaderStatus: 'Status',
    apiHeaderMethod: 'Method',
    apiHeaderUrl: 'URL',
    errorLabel: 'Error',
    unknownError: 'Unknown error'
  },
  de: {
    masterData: 'Stammdaten',
    masterDataPlantCatalog: 'Werkstammdaten',
    notLoggedIn: 'Nicht angemeldet', loginAuth: 'Anmeldung / Auth', authTitle: 'Authentifizierung & Benutzerverwaltung', provider: 'Anbieter', username: 'Benutzername', password: 'Passwort', oneTimeCode: 'Einmalcode',
    login: 'Anmelden', refresh: 'Aktualisieren', logout: 'Abmelden', adminUserMgmt: 'Admin-Benutzerverwaltung',
    stations: 'Stationen', lines: 'Linien', assignStationsToLines: 'Stationen Linien zuordnen', timeEvents: 'Zeitereignisse', shiftModells: 'Schichtmodelle', shiftSchedules: 'Schichtzuweisungen', assignShiftModell: 'Schichtmodell zuweisen', apiQuerySimulator: 'API-Abfragesimulator',
    show: 'Anzeigen', edit: 'Bearbeiten', saveClose: 'Speichern/Schließen', saveAssignments: 'Zuordnungen speichern', newLabel: 'Neu', importLabel: 'Importieren', exportLabel: 'Exportieren',
    applyToken: 'Token anwenden', query: 'Abfrage', runHealthCheck: 'Health Check starten', repairSql: 'SQL-Integrität reparieren', apiCatalogTester: 'API-Katalogtester', endpoint: 'Endpunkt', refreshRecommendations: 'Empfehlungen aktualisieren', testApi: 'API testen', result: 'Ergebnis', darkLabel: 'Dunkel', lightLabel: 'Hell', stationId: 'Stations-ID', lineId: 'Linien-ID', idLabel: 'ID', description: 'Beschreibung', bottleneck: 'Engpass', cycleTime: 'Zykluszeit (s)', action: 'Aktion', yesLabel: 'Ja', noLabel: 'Nein', addLabel: 'Hinzufügen', productiveLabel: 'Produktiv', weekdayLabel: 'Wochentag', shiftName: 'Schichtname', timeEvent: 'Zeitereignis', targetType: 'Zieltyp', targetIdLabel: 'Ziel-ID', targetLabelText: 'Zielname',
    plantLabel: 'Werk',
    templateNameLabel: 'Vorlagenname',
    templateCatalogLabel: 'Vorlagenkatalog (für ausgewähltes Werk)',
    storeAllToDb: 'Alles in Datenbank speichern',
    plantXtotalExport: 'PlantXtotal Export',
    renamePlant: 'Werk umbenennen',
    plantXtotalHint: 'PlantXtotal-Excel beinhaltet den vollständigen Umfang: Stationen, Linien, Zuordnungen, Engpässe, Zykluszeiten, Zeitereignisse, Schichtmodelle und Schichtzuweisungen.',
    saveLabel: 'Speichern',
    cancelLabel: 'Abbrechen',
    assignedStations: 'Zugewiesene Stationen',
    user: 'Benutzer',
    role: 'Rolle',
    enabledLabel: 'Aktiv',
    permissionsLabel: 'Berechtigungen',
    grantRevoke: 'Erteilen/Entziehen',
    actions: 'Aktionen',
    oneTimeCode6: 'Einmalcode (6-stellig)',
    newUsername: 'Neuer Benutzername',
    permissionsCommaSeparated: 'Berechtigungen kommasepariert',
    manualBearerToken: 'Manueller Bearer-Token',
    stationNumber: 'Stationsnummer',
    green: 'Grün',
    yellow: 'Gelb',
    red: 'Rot',
    healthGreenDesc: 'Alle APIs und die Datenbank sind gesund.',
    healthYellowDesc: 'System läuft, aber es gibt Warnungen zur Datenbankintegrität.',
    healthRedDesc: 'Mindestens eine API oder die Datenbank ist nicht erreichbar oder fehlgeschlagen.',
    noInputRequired: 'Keine Eingaben erforderlich.',
    apiInputFields: 'Eingabefelder',
    apiOutputFields: 'Ausgabefelder',
    assignmentId: 'Zuordnungs-ID',
    templateId: 'Vorlagen-ID',
    apiDescPatchStation: 'Stationsfelder ändern (Beschreibung, Engpass, Zykluszeit). Mindesteingabe: ID + mindestens ein Feld.',
    apiDescDeleteStation: 'Station per ID löschen. Mindesteingabe: ID.',
    apiDescPatchLine: 'Linienbeschreibung ändern. Mindesteingabe: ID, Beschreibung.',
    apiDescDeleteLine: 'Linie per ID löschen. Mindesteingabe: ID.',
    apiDescPatchShift: 'Schichtfelder ändern. Mindesteingabe: ID + ein oder mehrere Felder.',
    apiDescDeleteShift: 'Schicht per ID löschen. Mindesteingabe: ID.',
    apiDescGetAssignShift: 'Alle Schichtzuweisungen abrufen. Mindesteingabe: keine.',
    apiDescPatchAssignShift: 'Eine Schichtzuweisung ändern. Mindesteingabe: ID + targetType + targetId.',
    apiDescDeleteAssignShift: 'Eine Schichtzuweisung löschen. Mindesteingabe: ID.',
    apiDescDeleteTemplate: 'Eine Stammdatenvorlage per ID löschen. Mindesteingabe: ID.',
    apiHeaderStatus: 'Status',
    apiHeaderMethod: 'Methode',
    apiHeaderUrl: 'URL',
    errorLabel: 'Fehler',
    unknownError: 'Unbekannter Fehler'
  },
  es: {
    masterData: 'Datos maestros', masterDataPlantCatalog: 'Catalogo de datos maestros de planta', plantLabel: 'Planta', templateNameLabel: 'Nombre de plantilla', templateCatalogLabel: 'Catalogo de plantillas (para la planta seleccionada)', storeAllToDb: 'Guardar todo en BD', plantXtotalExport: 'Exportar PlantXtotal', renamePlant: 'Renombrar planta', plantXtotalHint: 'PlantXtotal Excel incluye el alcance completo de datos: estaciones, lineas, asignaciones, cuellos de botella, tiempos de ciclo, eventos de tiempo, modelos de turno y asignaciones de turno.',
    notLoggedIn: 'No conectado', loginAuth: 'Login / Auth', authTitle: 'Autenticación y gestión de usuarios', provider: 'Proveedor', username: 'Usuario', password: 'Contraseña', oneTimeCode: 'Código de un solo uso',
    login: 'Iniciar sesión', refresh: 'Actualizar', logout: 'Cerrar sesión', adminUserMgmt: 'Gestión de usuarios admin',
    stations: 'Estaciones', lines: 'Líneas', assignStationsToLines: 'Asignar estaciones a líneas', timeEvents: 'Eventos de tiempo', shiftModells: 'Modelos de turno', shiftSchedules: 'Horarios de turno', assignShiftModell: 'Asignar modelo de turno', apiQuerySimulator: 'Simulador de consulta API',
    show: 'Mostrar', edit: 'Editar', saveClose: 'Guardar/Cerrar', saveAssignments: 'Guardar asignaciones', newLabel: 'Nuevo', importLabel: 'Importar', exportLabel: 'Exportar',
    applyToken: 'Aplicar token', query: 'Consultar', runHealthCheck: 'Ejecutar Health Check', repairSql: 'Reparar integridad SQL', apiCatalogTester: 'Probador de catálogo API', endpoint: 'Endpoint', refreshRecommendations: 'Actualizar recomendaciones', testApi: 'Probar API', result: 'Resultado', templateLoadedPrefix: 'Plantilla cargada', noTemplatesFound: 'No se encontraron plantillas', noTemplatesAvailable: 'No hay plantillas disponibles.'
  },
  ko: {
    masterData: '기준 데이터', masterDataPlantCatalog: '공장 기준 데이터 카탈로그', plantLabel: '공장', templateNameLabel: '템플릿 이름', templateCatalogLabel: '템플릿 카탈로그(선택한 공장)', storeAllToDb: '전체 DB 저장', plantXtotalExport: 'PlantXtotal 내보내기', renamePlant: '공장 이름 변경', plantXtotalHint: 'PlantXtotal 엑셀에는 전체 데이터 범위가 포함됩니다: 스테이션, 라인, 할당, 병목 표시, 사이클 타임, 시간 이벤트, 교대 모델 및 교대 할당.',
    notLoggedIn: '로그인 안 됨', loginAuth: '로그인 / 인증', authTitle: '인증 및 사용자 관리', provider: '제공자', username: '사용자명', password: '비밀번호', oneTimeCode: '일회용 코드',
    login: '로그인', refresh: '새로고침', logout: '로그아웃', adminUserMgmt: '관리자 사용자 관리',
    stations: '스테이션', lines: '라인', assignStationsToLines: '스테이션을 라인에 할당', timeEvents: '시간 이벤트', shiftModells: '교대 모델', shiftSchedules: '교대 일정', assignShiftModell: '교대 모델 할당', apiQuerySimulator: 'API 쿼리 시뮬레이터',
    show: '보기', edit: '편집', saveClose: '저장/닫기', saveAssignments: '할당 저장', newLabel: '새로 만들기', importLabel: '가져오기', exportLabel: '내보내기',
    applyToken: '토큰 적용', query: '조회', runHealthCheck: '상태 점검 실행', repairSql: 'SQL 무결성 복구', apiCatalogTester: 'API 카탈로그 테스터', endpoint: '엔드포인트', refreshRecommendations: '추천 새로고침', testApi: 'API 테스트', result: '결과', templateLoadedPrefix: '템플릿 로드됨', noTemplatesFound: '템플릿을 찾을 수 없습니다', noTemplatesAvailable: '사용 가능한 템플릿이 없습니다.'
  },
  zh: {
    masterData: '主数据', masterDataPlantCatalog: '工厂主数据目录', plantLabel: '工厂', templateNameLabel: '模板名称', templateCatalogLabel: '模板目录（所选工厂）', storeAllToDb: '全部保存到数据库', plantXtotalExport: 'PlantXtotal 导出', renamePlant: '重命名工厂', plantXtotalHint: 'PlantXtotal Excel 包含完整数据范围：工位、产线、分配、瓶颈标记、节拍时间、时间事件、班次模型和班次分配。',
    notLoggedIn: '未登录', loginAuth: '登录 / 认证', authTitle: '认证与用户管理', provider: '提供方', username: '用户名', password: '密码', oneTimeCode: '一次性验证码',
    login: '登录', refresh: '刷新', logout: '登出', adminUserMgmt: '管理员用户管理',
    stations: '工位', lines: '产线', assignStationsToLines: '工位分配到产线', timeEvents: '时间事件', shiftModells: '班次模型', shiftSchedules: '班次计划', assignShiftModell: '分配班次模型', apiQuerySimulator: 'API 查询模拟器',
    show: '显示', edit: '编辑', saveClose: '保存/关闭', saveAssignments: '保存分配', newLabel: '新建', importLabel: '导入', exportLabel: '导出',
    applyToken: '应用令牌', query: '查询', runHealthCheck: '运行健康检查', repairSql: '修复 SQL 完整性', apiCatalogTester: 'API 目录测试器', endpoint: '接口', refreshRecommendations: '刷新推荐', testApi: '测试 API', result: '结果', templateLoadedPrefix: '模板已加载', noTemplatesFound: '未找到模板', noTemplatesAvailable: '没有可用模板。'
  },
  ru: {
    masterData: 'Основные данные', masterDataPlantCatalog: 'Каталог основных данных завода', plantLabel: 'Завод', templateNameLabel: 'Имя шаблона', templateCatalogLabel: 'Каталог шаблонов (для выбранного завода)', storeAllToDb: 'Сохранить все в БД', plantXtotalExport: 'Экспорт PlantXtotal', renamePlant: 'Переименовать завод', plantXtotalHint: 'Excel PlantXtotal включает полный объем данных: станции, линии, назначения, узкие места, время цикла, события времени, модели смен и назначения смен.',
    notLoggedIn: 'Не вошли', loginAuth: 'Вход / Авторизация', authTitle: 'Аутентификация и управление пользователями', provider: 'Провайдер', username: 'Пользователь', password: 'Пароль', oneTimeCode: 'Одноразовый код',
    login: 'Войти', refresh: 'Обновить', logout: 'Выйти', adminUserMgmt: 'Управление пользователями (админ)',
    stations: 'Станции', lines: 'Линии', assignStationsToLines: 'Назначить станции на линии', timeEvents: 'События времени', shiftModells: 'Модели смен', shiftSchedules: 'Расписания смен', assignShiftModell: 'Назначить модель смены', apiQuerySimulator: 'Симулятор API-запросов',
    show: 'Показать', edit: 'Редактировать', saveClose: 'Сохранить/Закрыть', saveAssignments: 'Сохранить назначения', newLabel: 'Новый', importLabel: 'Импорт', exportLabel: 'Экспорт',
    applyToken: 'Применить токен', query: 'Запрос', runHealthCheck: 'Запустить health check', repairSql: 'Исправить целостность SQL', apiCatalogTester: 'Тестер каталога API', endpoint: 'Эндпоинт', refreshRecommendations: 'Обновить рекомендации', testApi: 'Тест API', result: 'Результат', templateLoadedPrefix: 'Шаблон загружен', noTemplatesFound: 'Шаблоны не найдены', noTemplatesAvailable: 'Нет доступных шаблонов.'
  },
  fr: {
  },
  pt: {
    masterData: 'Dados mestres', masterDataPlantCatalog: 'Catalogo de dados mestres da planta', plantLabel: 'Planta', templateNameLabel: 'Nome do modelo', templateCatalogLabel: 'Catalogo de modelos (para a planta selecionada)', storeAllToDb: 'Salvar tudo no BD', plantXtotalExport: 'Exportar PlantXtotal', renamePlant: 'Renomear planta', plantXtotalHint: 'O Excel PlantXtotal inclui todo o escopo de dados: estacoes, linhas, atribuicoes, gargalos, tempos de ciclo, eventos de tempo, modelos de turno e atribuicoes de turno.', notLoggedIn: 'Não autenticado', loginAuth: 'Login / Autenticação', authTitle: 'Autenticação e Gerenciamento de Usuários', provider: 'Provedor', username: 'Usuário', password: 'Senha', oneTimeCode: 'Código Único', login: 'Entrar', refresh: 'Atualizar', logout: 'Sair', adminUserMgmt: 'Administração de Usuários', stations: 'Estações', lines: 'Linhas', assignStationsToLines: 'Atribuir Estações às Linhas', timeEvents: 'Eventos de Tempo', shiftModells: 'Modelos de Turno', shiftSchedules: 'Agendas de Turno', assignShiftModell: 'Atribuir Modelo de Turno', apiQuerySimulator: 'Simulador de Consulta API', show: 'Mostrar', edit: 'Editar', saveClose: 'Salvar/Fechar', saveAssignments: 'Salvar Atribuições', newLabel: 'Novo', importLabel: 'Importar', exportLabel: 'Exportar', applyToken: 'Aplicar Token', query: 'Consultar', runHealthCheck: 'Executar Verificação', repairSql: 'Reparar Integridade SQL', apiCatalogTester: 'Testador de Catálogo API', endpoint: 'Endpoint', refreshRecommendations: 'Atualizar Recomendações', testApi: 'Testar API', result: 'Resultado', duration: 'Duração', shiftId: 'ID do Turno', timeEventDesc: 'Descrição do Evento', start: 'Início', end: 'Fim', selectShiftModell: 'Selecionar Modelo de Turno', selectTarget: 'Selecionar Destino', stationSingular: 'Estação', lineSingular: 'Linha', assign: 'Atribuir', sendTestPointSql: 'Enviar Ponto de Teste para SQL', noManagedUsersFound: 'Nenhum usuário gerenciado encontrado.', grant: 'Conceder', revoke: 'Revogar', deleteLabel: 'Excluir', createUser: 'Criar Usuário', reload: 'Recarregar'
  },
  ja: {
    masterData: 'マスターデータ', masterDataPlantCatalog: '工場マスターデータカタログ', plantLabel: '工場', templateNameLabel: 'テンプレート名', templateCatalogLabel: 'テンプレートカタログ（選択した工場）', storeAllToDb: 'すべてDBへ保存', plantXtotalExport: 'PlantXtotal エクスポート', renamePlant: '工場名を変更', plantXtotalHint: 'PlantXtotal Excelには、ステーション、ライン、割り当て、ボトルネック、サイクルタイム、時間イベント、シフトモデル、シフト割り当てを含む全データ範囲が含まれます。', notLoggedIn: '未ログイン', loginAuth: 'ログイン / 認証', authTitle: '認証とユーザー管理', provider: 'プロバイダー', username: 'ユーザー名', password: 'パスワード', oneTimeCode: 'ワンタイムコード', login: 'ログイン', refresh: '更新', logout: 'ログアウト', adminUserMgmt: '管理者ユーザー管理', stations: 'ステーション', lines: 'ライン', assignStationsToLines: 'ステーションをラインに割り当て', timeEvents: '時間イベント', shiftModells: 'シフトモデル', shiftSchedules: 'シフトスケジュール', assignShiftModell: 'シフトモデル割り当て', apiQuerySimulator: 'APIクエリシミュレーター', show: '表示', edit: '編集', saveClose: '保存/閉じる', saveAssignments: '割り当てを保存', newLabel: '新規', importLabel: 'インポート', exportLabel: 'エクスポート', applyToken: 'トークン適用', query: 'クエリ', runHealthCheck: 'ヘルスチェック実行', repairSql: 'SQL整合性修復', apiCatalogTester: 'APIカタログテスター', endpoint: 'エンドポイント', refreshRecommendations: '推奨を更新', testApi: 'APIテスト', result: '結果', duration: '期間', shiftId: 'シフトID', timeEventDesc: 'イベント説明', start: '開始', end: '終了', selectShiftModell: 'シフトモデル選択', selectTarget: 'ターゲット選択', stationSingular: 'ステーション', lineSingular: 'ライン', assign: '割り当て', sendTestPointSql: 'テストポイントをSQLに送信', noManagedUsersFound: '管理ユーザーが見つかりません。', grant: '付与', revoke: '取り消し', deleteLabel: '削除', createUser: 'ユーザー作成', reload: '再読み込み'
  },
  sk: {
    masterData: 'Hlavné údaje', masterDataPlantCatalog: 'Katalog hlavnych udajov zavodu', plantLabel: 'Zavod', templateNameLabel: 'Nazov sablony', templateCatalogLabel: 'Katalog sablon (pre vybrany zavod)', storeAllToDb: 'Ulozit vsetko do DB', plantXtotalExport: 'Export PlantXtotal', renamePlant: 'Premenovat zavod', plantXtotalHint: 'PlantXtotal Excel obsahuje cely rozsah dat: stanice, linky, priradenia, uzke miesta, casy cyklu, casove udalosti, modely zmien a priradenia zmien.', notLoggedIn: 'Neprihlásený', loginAuth: 'Prihlásenie / Autentifikácia', authTitle: 'Autentifikácia a správa používateľov', provider: 'Poskytovateľ', username: 'Používateľ', password: 'Heslo', oneTimeCode: 'Jednorazový kód', login: 'Prihlásiť sa', refresh: 'Obnoviť', logout: 'Odhlásiť sa', adminUserMgmt: 'Správa používateľov (admin)', stations: 'Stanice', lines: 'Linky', assignStationsToLines: 'Priradiť stanice k linkám', timeEvents: 'Časové udalosti', shiftModells: 'Modely zmien', shiftSchedules: 'Plány zmien', assignShiftModell: 'Priradiť model zmeny', apiQuerySimulator: 'Simulátor API dopytov', show: 'Zobraziť', edit: 'Upraviť', saveClose: 'Uložiť/Zavrieť', saveAssignments: 'Uložiť priradenia', newLabel: 'Nový', importLabel: 'Importovať', exportLabel: 'Exportovať', applyToken: 'Použiť token', query: 'Dopyt', runHealthCheck: 'Spustiť kontrolu', repairSql: 'Opraviť integritu SQL', apiCatalogTester: 'Tester katalógu API', endpoint: 'Endpoint', refreshRecommendations: 'Obnoviť odporúčania', testApi: 'Testovať API', result: 'Výsledok', duration: 'Trvanie', shiftId: 'ID zmeny', timeEventDesc: 'Popis udalosti', start: 'Začiatok', end: 'Koniec', selectShiftModell: 'Vybrať model zmeny', selectTarget: 'Vybrať cieľ', stationSingular: 'Stanica', lineSingular: 'Linka', assign: 'Priradiť', sendTestPointSql: 'Odoslať testovací bod do SQL', noManagedUsersFound: 'Nenašli sa žiadni spravovaní používatelia.', grant: 'Udeľ', revoke: 'Odobrať', deleteLabel: 'Vymazať', createUser: 'Vytvoriť používateľa', reload: 'Obnoviť'
  },
  tr: {
    masterData: 'Ana Veri', masterDataPlantCatalog: 'Fabrika ana veri katalogu', plantLabel: 'Fabrika', templateNameLabel: 'Sablon adi', templateCatalogLabel: 'Sablon katalogu (secilen fabrika icin)', storeAllToDb: 'Her seyi veritabanina kaydet', plantXtotalExport: 'PlantXtotal disa aktar', renamePlant: 'Fabrikayi yeniden adlandir', plantXtotalHint: 'PlantXtotal Excel, istasyonlar, hatlar, atamalar, bogaz noktalar, dongu sureleri, zaman olaylari, vardiya modelleri ve vardiya atamalari dahil tum veri kapsamini icerir.', notLoggedIn: 'Giriş yapılmadı', loginAuth: 'Giriş / Kimlik Doğrulama', authTitle: 'Kimlik Doğrulama ve Kullanıcı Yönetimi', provider: 'Sağlayıcı', username: 'Kullanıcı Adı', password: 'Şifre', oneTimeCode: 'Tek Seferlik Kod', login: 'Giriş', refresh: 'Yenile', logout: 'Çıkış', adminUserMgmt: 'Yönetici Kullanıcı Yönetimi', stations: 'İstasyonlar', lines: 'Hatlar', assignStationsToLines: 'İstasyonları Hatlara Ata', timeEvents: 'Zaman Olayları', shiftModells: 'Vardiya Modelleri', shiftSchedules: 'Vardiya Programları', assignShiftModell: 'Vardiya Modeli Ata', apiQuerySimulator: 'API Sorgu Simülatörü', show: 'Göster', edit: 'Düzenle', saveClose: 'Kaydet/Kapat', saveAssignments: 'Atamaları Kaydet', newLabel: 'Yeni', importLabel: 'İçe Aktar', exportLabel: 'Dışa Aktar', applyToken: 'Token Uygula', query: 'Sorgu', runHealthCheck: 'Sağlık Kontrolü Yap', repairSql: 'SQL Bütünlüğünü Onar', apiCatalogTester: 'API Katalog Test Cihazı', endpoint: 'Uç Nokta', refreshRecommendations: 'Önerileri Yenile', testApi: 'API Test Et', result: 'Sonuç', duration: 'Süre', shiftId: 'Vardiya ID', timeEventDesc: 'Olay Açıklaması', start: 'Başlangıç', end: 'Bitiş', selectShiftModell: 'Vardiya Modeli Seç', selectTarget: 'Hedef Seç', stationSingular: 'İstasyon', lineSingular: 'Hat', assign: 'Ata', sendTestPointSql: 'Test Noktasını SQL\'e Gönder', noManagedUsersFound: 'Yönetilen kullanıcı bulunamadı.', grant: 'Ver', revoke: 'Geri Al', deleteLabel: 'Sil', createUser: 'Kullanıcı Oluştur', reload: 'Yeniden Yükle'
  },
  fr: {
    masterData: 'Données de base', masterDataPlantCatalog: 'Catalogue des donnees de base usine', plantLabel: 'Usine', templateNameLabel: 'Nom du modele', templateCatalogLabel: 'Catalogue des modeles (pour l\'usine selectionnee)', storeAllToDb: 'Tout enregistrer en base', plantXtotalExport: 'Export PlantXtotal', renamePlant: 'Renommer l\'usine', plantXtotalHint: 'Le fichier Excel PlantXtotal inclut toute la portee des donnees : stations, lignes, affectations, goulots, temps de cycle, evenements de temps, modeles de poste et affectations de poste.', notLoggedIn: 'Non connecté', loginAuth: 'Connexion / Auth', authTitle: 'Authentification et gestion des utilisateurs', provider: 'Fournisseur', username: "Nom d'utilisateur", password: 'Mot de passe', oneTimeCode: 'Code à usage unique', login: 'Connexion', refresh: 'Rafraîchir', logout: 'Déconnexion', adminUserMgmt: 'Gestion des utilisateurs admin', stations: 'Stations', lines: 'Lignes', assignStationsToLines: 'Assigner stations aux lignes', timeEvents: 'Événements de temps', shiftModells: 'Modèles de poste', shiftSchedules: 'Plannings de poste', assignShiftModell: 'Assigner modèle de poste', apiQuerySimulator: 'Simulateur de requête API', show: 'Afficher', edit: 'Éditer', saveClose: 'Enregistrer/Fermer', saveAssignments: 'Enregistrer les affectations', newLabel: 'Nouveau', importLabel: 'Importer', exportLabel: 'Exporter', applyToken: 'Appliquer le token', query: 'Requête', runHealthCheck: 'Lancer Health Check', repairSql: 'Réparer l’intégrité SQL', apiCatalogTester: 'Testeur de catalogue API', endpoint: 'Point de terminaison', refreshRecommendations: 'Rafraîchir recommandations', testApi: 'Tester API', result: 'Résultat', templateLoadedPrefix: 'Modele charge', noTemplatesFound: 'Aucun modele trouve', noTemplatesAvailable: 'Aucun modele disponible.'
  }
};

const I18N_EXT = {
  // Table names, dropdowns, field suggestions, placeholders, hints
  en: {
    tableStations: 'Stations', tableLines: 'Lines', tableAssignments: 'Assignments', tableTimeEvents: 'Time Events', tableShiftModells: 'Shift Modells', tableShiftSchedules: 'Shift Schedules',
    dropdownSelect: 'Select...', dropdownStation: 'Station', dropdownLine: 'Line', dropdownTarget: 'Target',
    fieldSuggestion: 'Type to search...',
    placeholderTableSearch: 'Search table...',
    hintRequired: 'Required field',
    hintDropdown: 'Please select an option',
    hintTableEmpty: 'No data available.'
  },
  de: {
    tableStations: 'Stationen', tableLines: 'Linien', tableAssignments: 'Zuordnungen', tableTimeEvents: 'Zeitereignisse', tableShiftModells: 'Schichtmodelle', tableShiftSchedules: 'Schichtpläne',
    dropdownSelect: 'Auswählen...', dropdownStation: 'Station', dropdownLine: 'Linie', dropdownTarget: 'Ziel',
    fieldSuggestion: 'Tippen zum Suchen...',
    placeholderTableSearch: 'Tabelle durchsuchen...',
    hintRequired: 'Pflichtfeld',
    hintDropdown: 'Bitte wählen Sie eine Option',
    hintTableEmpty: 'Keine Daten vorhanden.'
  },
  es: {
    tableStations: 'Estaciones', tableLines: 'Líneas', tableAssignments: 'Asignaciones', tableTimeEvents: 'Eventos de tiempo', tableShiftModells: 'Modelos de turno', tableShiftSchedules: 'Horarios de turno',
    dropdownSelect: 'Seleccionar...', dropdownStation: 'Estación', dropdownLine: 'Línea', dropdownTarget: 'Destino',
    fieldSuggestion: 'Escriba para buscar...',
    placeholderTableSearch: 'Buscar en la tabla...',
    hintRequired: 'Campo obligatorio',
    hintDropdown: 'Por favor seleccione una opción',
    hintTableEmpty: 'No hay datos disponibles.'
  },
  ko: {
    tableStations: '스테이션', tableLines: '라인', tableAssignments: '할당', tableTimeEvents: '시간 이벤트', tableShiftModells: '교대 모델', tableShiftSchedules: '교대 일정',
    dropdownSelect: '선택...', dropdownStation: '스테이션', dropdownLine: '라인', dropdownTarget: '대상',
    fieldSuggestion: '검색하려면 입력하세요...',
    placeholderTableSearch: '테이블 검색...',
    hintRequired: '필수 입력',
    hintDropdown: '옵션을 선택하세요',
    hintTableEmpty: '데이터가 없습니다.'
  },
  zh: {
    tableStations: '工位', tableLines: '产线', tableAssignments: '分配', tableTimeEvents: '时间事件', tableShiftModells: '班次模型', tableShiftSchedules: '班次计划',
    dropdownSelect: '请选择...', dropdownStation: '工位', dropdownLine: '产线', dropdownTarget: '目标',
    fieldSuggestion: '输入以搜索...',
    placeholderTableSearch: '搜索表格...',
    hintRequired: '必填项',
    hintDropdown: '请选择一个选项',
    hintTableEmpty: '无可用数据。'
  },
  ru: {
    tableStations: 'Станции', tableLines: 'Линии', tableAssignments: 'Назначения', tableTimeEvents: 'События времени', tableShiftModells: 'Модели смен', tableShiftSchedules: 'Расписания смен',
    dropdownSelect: 'Выбрать...', dropdownStation: 'Станция', dropdownLine: 'Линия', dropdownTarget: 'Цель',
    fieldSuggestion: 'Введите для поиска...',
    placeholderTableSearch: 'Поиск по таблице...',
    hintRequired: 'Обязательное поле',
    hintDropdown: 'Пожалуйста, выберите опцию',
    hintTableEmpty: 'Нет доступных данных.'
  },
  fr: {
    tableStations: 'Stations', tableLines: 'Lignes', tableAssignments: 'Affectations', tableTimeEvents: 'Événements de temps', tableShiftModells: 'Modèles de poste', tableShiftSchedules: 'Plannings de poste',
    dropdownSelect: 'Sélectionner...', dropdownStation: 'Station', dropdownLine: 'Ligne', dropdownTarget: 'Cible',
    fieldSuggestion: 'Tapez pour rechercher...',
    placeholderTableSearch: 'Rechercher dans le tableau...',
    hintRequired: 'Champ requis',
    hintDropdown: 'Veuillez sélectionner une option',
    hintTableEmpty: 'Aucune donnée disponible.'
  },
  pt: {
    tableStations: 'Estações', tableLines: 'Linhas', tableAssignments: 'Atribuições', tableTimeEvents: 'Eventos de Tempo', tableShiftModells: 'Modelos de Turno', tableShiftSchedules: 'Agendas de Turno',
    dropdownSelect: 'Selecionar...', dropdownStation: 'Estação', dropdownLine: 'Linha', dropdownTarget: 'Destino',
    fieldSuggestion: 'Digite para pesquisar...',
    placeholderTableSearch: 'Pesquisar na tabela...',
    hintRequired: 'Campo obrigatório',
    hintDropdown: 'Por favor selecione uma opção',
    hintTableEmpty: 'Nenhum dado disponível.'
  },
  ja: {
    tableStations: 'ステーション', tableLines: 'ライン', tableAssignments: '割り当て', tableTimeEvents: '時間イベント', tableShiftModells: 'シフトモデル', tableShiftSchedules: 'シフトスケジュール',
    dropdownSelect: '選択...', dropdownStation: 'ステーション', dropdownLine: 'ライン', dropdownTarget: 'ターゲット',
    fieldSuggestion: '検索するには入力...',
    placeholderTableSearch: 'テーブルを検索...',
    hintRequired: '必須項目',
    hintDropdown: 'オプションを選択してください',
    hintTableEmpty: 'データがありません。'
  },
  sk: {
    tableStations: 'Stanice', tableLines: 'Linky', tableAssignments: 'Priradenia', tableTimeEvents: 'Časové udalosti', tableShiftModells: 'Modely zmien', tableShiftSchedules: 'Plány zmien',
    dropdownSelect: 'Vybrať...', dropdownStation: 'Stanica', dropdownLine: 'Linka', dropdownTarget: 'Cieľ',
    fieldSuggestion: 'Píšte pre vyhľadávanie...',
    placeholderTableSearch: 'Vyhľadať v tabuľke...',
    hintRequired: 'Povinné pole',
    hintDropdown: 'Prosím vyberte možnosť',
    hintTableEmpty: 'Žiadne dostupné dáta.'
  },
  tr: {
    tableStations: 'İstasyonlar', tableLines: 'Hatlar', tableAssignments: 'Atamalar', tableTimeEvents: 'Zaman Olayları', tableShiftModells: 'Vardiya Modelleri', tableShiftSchedules: 'Vardiya Programları',
    dropdownSelect: 'Seç...', dropdownStation: 'İstasyon', dropdownLine: 'Hat', dropdownTarget: 'Hedef',
    fieldSuggestion: 'Aramak için yazın...',
    placeholderTableSearch: 'Tabloda ara...',
    hintRequired: 'Zorunlu alan',
    hintDropdown: 'Lütfen bir seçenek seçin',
    hintTableEmpty: 'Veri yok.'
  },
  it: {
    tableStations: 'Stazioni', tableLines: 'Linee', tableAssignments: 'Assegnazioni', tableTimeEvents: 'Eventi temporali', tableShiftModells: 'Modelli di turno', tableShiftSchedules: 'Programmi di turno',
    dropdownSelect: 'Seleziona...', dropdownStation: 'Stazione', dropdownLine: 'Linea', dropdownTarget: 'Destinazione',
    fieldSuggestion: 'Digita per cercare...',
    placeholderTableSearch: 'Cerca nella tabella...',
    hintRequired: 'Campo obbligatorio',
    hintDropdown: 'Seleziona un opzione',
    hintTableEmpty: 'Nessun dato disponibile.'
  },
  hi: {
    tableStations: 'स्टेशन', tableLines: 'लाइनें', tableAssignments: 'असाइनमेंट', tableTimeEvents: 'समय घटनाएँ', tableShiftModells: 'शिफ्ट मॉडल', tableShiftSchedules: 'शिफ्ट शेड्यूल',
    dropdownSelect: 'चुनें...', dropdownStation: 'स्टेशन', dropdownLine: 'लाइन', dropdownTarget: 'लक्ष्य',
    fieldSuggestion: 'खोजने के लिए टाइप करें...',
    placeholderTableSearch: 'तालिका खोजें...',
    hintRequired: 'आवश्यक फ़ील्ड',
    hintDropdown: 'कृपया एक विकल्प चुनें',
    hintTableEmpty: 'कोई डेटा उपलब्ध नहीं है।'
  }
};

Object.keys(I18N_EXT).forEach((lang) => {
  if (!I18N[lang]) {
    I18N[lang] = {};
  }
  Object.assign(I18N[lang], I18N_EXT[lang]);
});

const I18N_SHAPE_DEFAULTS = {
  lastStation: 'Last Station',
  lineShape: 'Line Shape',
  visual: 'Visual'
};

Object.keys(I18N).forEach((lang) => {
  if (!I18N[lang]) {
    I18N[lang] = {};
  }
  Object.keys(I18N_SHAPE_DEFAULTS).forEach((key) => {
    if (typeof I18N[lang][key] === 'undefined') {
      I18N[lang][key] = I18N_SHAPE_DEFAULTS[key];
    }
  });
});

Object.assign(I18N.en, {
  noShiftAssignmentsYet: 'No shift assignments yet.',
  noAssignmentsYet: 'No assignments yet.',
  noLineAvailable: 'No line available',
  noStationAvailable: 'No station available',
  selectWeekday: 'Select weekday',
  shiftModellNameRequired: 'Shift Modell Name (required)',
  shiftNamePlaceholder: 'Shift name',
  weekdayMonday: 'Monday',
  weekdayTuesday: 'Tuesday',
  weekdayWednesday: 'Wednesday',
  weekdayThursday: 'Thursday',
  weekdayFriday: 'Friday',
  weekdaySaturday: 'Saturday',
  weekdaySunday: 'Sunday',
  sampleDataLoaded: 'Sample factory test data loaded successfully.',
  templateSyncDone: 'imported and template synchronized automatically.',
  templateSyncSkipped: 'imported. Template sync skipped.',
  catalogLoading: 'Loading catalog...',
  noTemplatesFound: 'No templates found',
  noTemplatesAvailable: 'No templates available.',
  catalogLoadedPrefix: 'Catalog loaded',
  catalogLoadFailed: 'Loading catalog failed.',
  plantRequired: 'Plant is required.',
  templateSaving: 'Saving template to database...',
  templateLoading: 'Loading selected template...',
  templateLoadedPrefix: 'Template loaded',
  templateLoadFailed: 'Loading selected template failed.',
  renamingPlant: 'Renaming plant...',
  templatePlantRenamedPrefix: 'Template plant renamed to',
  renamingPlantFailed: 'Renaming plant failed.',
  runningHealthCheck: 'Running health check...',
  systemHealthy: 'System healthy',
  systemDegraded: 'System degraded',
  systemUnhealthy: 'System unhealthy',
  stationsApi: 'Stations API',
  linesApi: 'Lines API',
  shiftsApi: 'Shifts API',
  sqlIntegrityApi: 'SQL Integrity API',
  integrityWarningsPrefix: 'Integrity warnings',
  healthyText: 'Healthy',
  runSqlRepairConfirm: 'Run SQL integrity repair now?',
  repairCancelled: 'Repair cancelled by user.',
  repairRunning: 'Running SQL integrity repair...',
  repairCompletedPrefix: 'Repair completed.',
  fixedRowsLabel: 'Fixed rows',
  statusLabel: 'Status',
  sendTestPointSuccess: 'Test point sent to InfluxDB!'
  ,selectTemplateFromCatalog: 'Please select a template from catalog.'
  ,selectTargetPlantFirst: 'Please select a target plant first.'
  ,templateSavedForPlantPrefix: 'Template saved for plant'
});

Object.assign(I18N.es, {
  apiInputFields: 'Campos de entrada',
  apiOutputFields: 'Campos de salida',
  assignmentId: 'ID de asignación',
  templateId: 'ID de plantilla',
  apiDescPatchStation: 'Cambiar campos de estación (descripción, cuello de botella, tiempo de ciclo). Entrada mínima: id + al menos un campo.',
  apiDescDeleteStation: 'Eliminar estación por id. Entrada mínima: id.',
  apiDescPatchLine: 'Cambiar descripción de línea. Entrada mínima: id, descripción.',
  apiDescDeleteLine: 'Eliminar línea por id. Entrada mínima: id.',
  apiDescPatchShift: 'Cambiar campos de turno. Entrada mínima: id + uno o más campos.',
  apiDescDeleteShift: 'Eliminar turno por id. Entrada mínima: id.',
  apiDescGetAssignShift: 'Obtener todas las asignaciones de turno. Entrada mínima: ninguna.',
  apiDescPatchAssignShift: 'Cambiar una asignación de turno. Entrada mínima: id + targetType + targetId.',
  apiDescDeleteAssignShift: 'Eliminar una asignación de turno. Entrada mínima: id.',
  apiDescDeleteTemplate: 'Eliminar una plantilla de datos maestros por id. Entrada mínima: id.',
  apiHeaderStatus: 'Estado',
  apiHeaderMethod: 'Método',
  apiHeaderUrl: 'URL',
  errorLabel: 'Error',
  unknownError: 'Error desconocido'
});

Object.assign(I18N.fr, {
  apiInputFields: 'Champs d\'entrée',
  apiOutputFields: 'Champs de sortie',
  assignmentId: 'ID d\'affectation',
  templateId: 'ID du modèle',
  apiDescPatchStation: 'Modifier les champs de station (description, goulot, temps de cycle). Entrée minimale : id + au moins un champ.',
  apiDescDeleteStation: 'Supprimer une station par id. Entrée minimale : id.',
  apiDescPatchLine: 'Modifier la description de ligne. Entrée minimale : id, description.',
  apiDescDeleteLine: 'Supprimer une ligne par id. Entrée minimale : id.',
  apiDescPatchShift: 'Modifier les champs de poste. Entrée minimale : id + un ou plusieurs champs.',
  apiDescDeleteShift: 'Supprimer un poste par id. Entrée minimale : id.',
  apiDescGetAssignShift: 'Récupérer toutes les affectations de poste. Entrée minimale : aucune.',
  apiDescPatchAssignShift: 'Modifier une affectation de poste. Entrée minimale : id + targetType + targetId.',
  apiDescDeleteAssignShift: 'Supprimer une affectation de poste. Entrée minimale : id.',
  apiDescDeleteTemplate: 'Supprimer un modèle de données de base par id. Entrée minimale : id.',
  apiHeaderStatus: 'Statut',
  apiHeaderMethod: 'Méthode',
  apiHeaderUrl: 'URL',
  errorLabel: 'Erreur',
  unknownError: 'Erreur inconnue'
});

Object.assign(I18N.zh, {
  apiInputFields: '输入字段',
  apiOutputFields: '输出字段',
  assignmentId: '分配 ID',
  templateId: '模板 ID',
  apiDescPatchStation: '修改工位字段（描述、瓶颈、节拍时间）。最小输入：id + 至少一个字段。',
  apiDescDeleteStation: '按 id 删除工位。最小输入：id。',
  apiDescPatchLine: '修改产线描述。最小输入：id、描述。',
  apiDescDeleteLine: '按 id 删除产线。最小输入：id。',
  apiDescPatchShift: '修改班次字段。最小输入：id + 一个或多个字段。',
  apiDescDeleteShift: '按 id 删除班次。最小输入：id。',
  apiDescGetAssignShift: '获取全部班次分配。最小输入：无。',
  apiDescPatchAssignShift: '修改单个班次分配。最小输入：id + targetType + targetId。',
  apiDescDeleteAssignShift: '删除单个班次分配。最小输入：id。',
  apiDescDeleteTemplate: '按 id 删除一条主数据模板。最小输入：id。',
  apiHeaderStatus: '状态',
  apiHeaderMethod: '方法',
  apiHeaderUrl: 'URL',
  errorLabel: '错误',
  unknownError: '未知错误'
});

Object.assign(I18N.de, {
  start: 'Start',
  end: 'Ende',
  duration: 'Dauer',
  noShiftAssignmentsYet: 'Noch keine Schichtzuweisungen.',
  noAssignmentsYet: 'Noch keine Zuordnungen.',
  noLineAvailable: 'Keine Linie verfügbar',
  noStationAvailable: 'Keine Station verfügbar',
  selectWeekday: 'Wochentag auswählen',
  shiftModellNameRequired: 'Schichtmodellname (erforderlich)',
  shiftNamePlaceholder: 'Schichtname',
  weekdayMonday: 'Montag',
  weekdayTuesday: 'Dienstag',
  weekdayWednesday: 'Mittwoch',
  weekdayThursday: 'Donnerstag',
  weekdayFriday: 'Freitag',
  weekdaySaturday: 'Samstag',
  weekdaySunday: 'Sonntag',
  sampleDataLoaded: 'Werkstestdaten erfolgreich geladen.',
  templateSyncDone: 'importiert und Template automatisch synchronisiert.',
  templateSyncSkipped: 'importiert. Template-Synchronisierung übersprungen.',
  catalogLoading: 'Katalog wird geladen...',
  noTemplatesFound: 'Keine Templates gefunden',
  noTemplatesAvailable: 'Keine Templates verfügbar.',
  catalogLoadedPrefix: 'Katalog geladen',
  catalogLoadFailed: 'Katalog laden fehlgeschlagen.',
  plantRequired: 'Werk ist erforderlich.',
  templateSaving: 'Vorlage wird in der Datenbank gespeichert...',
  templateLoading: 'Ausgewählte Vorlage wird geladen...',
  templateLoadedPrefix: 'Vorlage geladen',
  templateLoadFailed: 'Vorlage laden fehlgeschlagen.',
  renamingPlant: 'Werk wird umbenannt...',
  templatePlantRenamedPrefix: 'Vorlagen-Werk umbenannt auf',
  renamingPlantFailed: 'Werk umbenennen fehlgeschlagen.',
  runningHealthCheck: 'Health Check wird ausgeführt...',
  systemHealthy: 'System gesund',
  systemDegraded: 'System eingeschränkt',
  systemUnhealthy: 'System kritisch',
  stationsApi: 'Stationen-API',
  linesApi: 'Linien-API',
  shiftsApi: 'Schichten-API',
  sqlIntegrityApi: 'SQL-Integritäts-API',
  integrityWarningsPrefix: 'Integritätswarnungen',
  healthyText: 'In Ordnung',
  runSqlRepairConfirm: 'SQL-Integritätsreparatur jetzt ausführen?',
  repairCancelled: 'Reparatur vom Benutzer abgebrochen.',
  repairRunning: 'SQL-Integritätsreparatur läuft...',
  repairCompletedPrefix: 'Reparatur abgeschlossen.',
  fixedRowsLabel: 'Behobene Zeilen',
  statusLabel: 'Status',
  sendTestPointSuccess: 'Testpunkt an InfluxDB gesendet!',
  selectTemplateFromCatalog: 'Bitte eine Vorlage aus dem Katalog auswählen.',
  selectTargetPlantFirst: 'Bitte zuerst ein Zielwerk auswählen.',
  templateSavedForPlantPrefix: 'Vorlage gespeichert für Werk'
});

const TABLE_RUNTIME_I18N = {
  es: {
    start: 'Inicio', end: 'Fin', duration: 'Duracion', idLabel: 'ID',
    yesLabel: 'Si', noLabel: 'No', addLabel: 'Agregar', productiveLabel: 'Productivo',
    weekdayLabel: 'Dia de semana', shiftName: 'Nombre del turno', timeEvent: 'Evento de tiempo',
    targetType: 'Tipo de destino', targetIdLabel: 'ID de destino', targetLabelText: 'Etiqueta de destino',
    noShiftAssignmentsYet: 'Aun no hay asignaciones de turno.', noAssignmentsYet: 'Aun no hay asignaciones.',
    noLineAvailable: 'No hay linea disponible', noStationAvailable: 'No hay estacion disponible',
    selectWeekday: 'Seleccionar dia', shiftModellNameRequired: 'Nombre del modelo de turno (obligatorio)',
    shiftNamePlaceholder: 'Nombre del turno',
    weekdayMonday: 'Lunes', weekdayTuesday: 'Martes', weekdayWednesday: 'Miercoles', weekdayThursday: 'Jueves',
    weekdayFriday: 'Viernes', weekdaySaturday: 'Sabado', weekdaySunday: 'Domingo'
  },
  ko: {
    start: '시작', end: '종료', duration: '기간', idLabel: 'ID',
    yesLabel: '예', noLabel: '아니오', addLabel: '추가', productiveLabel: '생산',
    weekdayLabel: '요일', shiftName: '교대 이름', timeEvent: '시간 이벤트',
    targetType: '대상 유형', targetIdLabel: '대상 ID', targetLabelText: '대상 라벨',
    noShiftAssignmentsYet: '아직 교대 할당이 없습니다.', noAssignmentsYet: '아직 할당이 없습니다.',
    noLineAvailable: '사용 가능한 라인이 없습니다', noStationAvailable: '사용 가능한 스테이션이 없습니다',
    selectWeekday: '요일 선택', shiftModellNameRequired: '교대 모델 이름(필수)',
    shiftNamePlaceholder: '교대 이름',
    weekdayMonday: '월요일', weekdayTuesday: '화요일', weekdayWednesday: '수요일', weekdayThursday: '목요일',
    weekdayFriday: '금요일', weekdaySaturday: '토요일', weekdaySunday: '일요일'
  },
  zh: {
    start: '开始', end: '结束', duration: '时长', idLabel: 'ID',
    yesLabel: '是', noLabel: '否', addLabel: '新增', productiveLabel: '生产',
    weekdayLabel: '星期', shiftName: '班次名称', timeEvent: '时间事件',
    targetType: '目标类型', targetIdLabel: '目标ID', targetLabelText: '目标标签',
    noShiftAssignmentsYet: '暂无班次分配。', noAssignmentsYet: '暂无分配。',
    noLineAvailable: '没有可用产线', noStationAvailable: '没有可用工位',
    selectWeekday: '选择星期', shiftModellNameRequired: '班次模型名称（必填）',
    shiftNamePlaceholder: '班次名称',
    weekdayMonday: '星期一', weekdayTuesday: '星期二', weekdayWednesday: '星期三', weekdayThursday: '星期四',
    weekdayFriday: '星期五', weekdaySaturday: '星期六', weekdaySunday: '星期日'
  },
  ru: {
    start: 'Начало', end: 'Конец', duration: 'Длительность', idLabel: 'ID',
    yesLabel: 'Да', noLabel: 'Нет', addLabel: 'Добавить', productiveLabel: 'Продуктивно',
    weekdayLabel: 'День недели', shiftName: 'Название смены', timeEvent: 'Событие времени',
    targetType: 'Тип цели', targetIdLabel: 'ID цели', targetLabelText: 'Метка цели',
    noShiftAssignmentsYet: 'Назначений смен пока нет.', noAssignmentsYet: 'Назначений пока нет.',
    noLineAvailable: 'Нет доступной линии', noStationAvailable: 'Нет доступной станции',
    selectWeekday: 'Выберите день недели', shiftModellNameRequired: 'Имя модели смены (обязательно)',
    shiftNamePlaceholder: 'Название смены',
    weekdayMonday: 'Понедельник', weekdayTuesday: 'Вторник', weekdayWednesday: 'Среда', weekdayThursday: 'Четверг',
    weekdayFriday: 'Пятница', weekdaySaturday: 'Суббота', weekdaySunday: 'Воскресенье'
  },
  fr: {
    start: 'Debut', end: 'Fin', duration: 'Duree', idLabel: 'ID',
    yesLabel: 'Oui', noLabel: 'Non', addLabel: 'Ajouter', productiveLabel: 'Productif',
    weekdayLabel: 'Jour', shiftName: 'Nom du poste', timeEvent: 'Evenement temporel',
    targetType: 'Type de cible', targetIdLabel: 'ID cible', targetLabelText: 'Libelle cible',
    noShiftAssignmentsYet: 'Aucune affectation de poste pour le moment.', noAssignmentsYet: 'Aucune affectation pour le moment.',
    noLineAvailable: 'Aucune ligne disponible', noStationAvailable: 'Aucune station disponible',
    selectWeekday: 'Selectionner un jour', shiftModellNameRequired: 'Nom du modele de poste (obligatoire)',
    shiftNamePlaceholder: 'Nom du poste',
    weekdayMonday: 'Lundi', weekdayTuesday: 'Mardi', weekdayWednesday: 'Mercredi', weekdayThursday: 'Jeudi',
    weekdayFriday: 'Vendredi', weekdaySaturday: 'Samedi', weekdaySunday: 'Dimanche'
  },
  pt: {
    start: 'Inicio', end: 'Fim', duration: 'Duracao', idLabel: 'ID',
    yesLabel: 'Sim', noLabel: 'Nao', addLabel: 'Adicionar', productiveLabel: 'Produtivo',
    weekdayLabel: 'Dia da semana', shiftName: 'Nome do turno', timeEvent: 'Evento de tempo',
    targetType: 'Tipo de destino', targetIdLabel: 'ID do destino', targetLabelText: 'Rotulo do destino',
    noShiftAssignmentsYet: 'Ainda nao ha atribuicoes de turno.', noAssignmentsYet: 'Ainda nao ha atribuicoes.',
    noLineAvailable: 'Nenhuma linha disponivel', noStationAvailable: 'Nenhuma estacao disponivel',
    selectWeekday: 'Selecionar dia da semana', shiftModellNameRequired: 'Nome do modelo de turno (obrigatorio)',
    shiftNamePlaceholder: 'Nome do turno',
    weekdayMonday: 'Segunda-feira', weekdayTuesday: 'Terca-feira', weekdayWednesday: 'Quarta-feira', weekdayThursday: 'Quinta-feira',
    weekdayFriday: 'Sexta-feira', weekdaySaturday: 'Sabado', weekdaySunday: 'Domingo'
  },
  ja: {
    start: '開始', end: '終了', duration: '期間', idLabel: 'ID',
    yesLabel: 'はい', noLabel: 'いいえ', addLabel: '追加', productiveLabel: '生産',
    weekdayLabel: '曜日', shiftName: 'シフト名', timeEvent: '時間イベント',
    targetType: '対象タイプ', targetIdLabel: '対象ID', targetLabelText: '対象ラベル',
    noShiftAssignmentsYet: 'シフト割り当てはまだありません。', noAssignmentsYet: '割り当てはまだありません。',
    noLineAvailable: '利用可能なラインがありません', noStationAvailable: '利用可能なステーションがありません',
    selectWeekday: '曜日を選択', shiftModellNameRequired: 'シフトモデル名（必須）',
    shiftNamePlaceholder: 'シフト名',
    weekdayMonday: '月曜日', weekdayTuesday: '火曜日', weekdayWednesday: '水曜日', weekdayThursday: '木曜日',
    weekdayFriday: '金曜日', weekdaySaturday: '土曜日', weekdaySunday: '日曜日'
  },
  sk: {
    start: 'Zaciatok', end: 'Koniec', duration: 'Trvanie', idLabel: 'ID',
    yesLabel: 'Ano', noLabel: 'Nie', addLabel: 'Pridat', productiveLabel: 'Produktivne',
    weekdayLabel: 'Den v tyzdni', shiftName: 'Nazov zmeny', timeEvent: 'Casova udalost',
    targetType: 'Typ ciela', targetIdLabel: 'ID ciela', targetLabelText: 'Nazov ciela',
    noShiftAssignmentsYet: 'Zatial ziadne priradenia zmien.', noAssignmentsYet: 'Zatial ziadne priradenia.',
    noLineAvailable: 'Nie je dostupna ziadna linka', noStationAvailable: 'Nie je dostupna ziadna stanica',
    selectWeekday: 'Vyberte den v tyzdni', shiftModellNameRequired: 'Nazov modelu zmeny (povinne)',
    shiftNamePlaceholder: 'Nazov zmeny',
    weekdayMonday: 'Pondelok', weekdayTuesday: 'Utorok', weekdayWednesday: 'Streda', weekdayThursday: 'Stvrtok',
    weekdayFriday: 'Piatok', weekdaySaturday: 'Sobota', weekdaySunday: 'Nedela'
  },
  tr: {
    start: 'Baslangic', end: 'Bitis', duration: 'Sure', idLabel: 'ID',
    yesLabel: 'Evet', noLabel: 'Hayir', addLabel: 'Ekle', productiveLabel: 'Uretken',
    weekdayLabel: 'Haftanin gunu', shiftName: 'Vardiya adi', timeEvent: 'Zaman olayi',
    targetType: 'Hedef tipi', targetIdLabel: 'Hedef ID', targetLabelText: 'Hedef etiketi',
    noShiftAssignmentsYet: 'Henuz vardiya atamasi yok.', noAssignmentsYet: 'Henuz atama yok.',
    noLineAvailable: 'Kullanilabilir hat yok', noStationAvailable: 'Kullanilabilir istasyon yok',
    selectWeekday: 'Haftanin gununu secin', shiftModellNameRequired: 'Vardiya modeli adi (zorunlu)',
    shiftNamePlaceholder: 'Vardiya adi',
    weekdayMonday: 'Pazartesi', weekdayTuesday: 'Sali', weekdayWednesday: 'Carsamba', weekdayThursday: 'Persembe',
    weekdayFriday: 'Cuma', weekdaySaturday: 'Cumartesi', weekdaySunday: 'Pazar'
  },
  it: {
    start: 'Inizio', end: 'Fine', duration: 'Durata', idLabel: 'ID',
    yesLabel: 'Si', noLabel: 'No', addLabel: 'Aggiungi', productiveLabel: 'Produttivo',
    weekdayLabel: 'Giorno della settimana', shiftName: 'Nome turno', timeEvent: 'Evento temporale',
    targetType: 'Tipo destinazione', targetIdLabel: 'ID destinazione', targetLabelText: 'Etichetta destinazione',
    noShiftAssignmentsYet: 'Nessuna assegnazione turno al momento.', noAssignmentsYet: 'Nessuna assegnazione al momento.',
    noLineAvailable: 'Nessuna linea disponibile', noStationAvailable: 'Nessuna stazione disponibile',
    selectWeekday: 'Seleziona giorno', shiftModellNameRequired: 'Nome modello turno (obbligatorio)',
    shiftNamePlaceholder: 'Nome turno',
    weekdayMonday: 'Lunedi', weekdayTuesday: 'Martedi', weekdayWednesday: 'Mercoledi', weekdayThursday: 'Giovedi',
    weekdayFriday: 'Venerdi', weekdaySaturday: 'Sabato', weekdaySunday: 'Domenica'
  },
  hi: {
    start: 'प्रारंभ', end: 'समाप्ति', duration: 'अवधि', idLabel: 'ID',
    yesLabel: 'हां', noLabel: 'नहीं', addLabel: 'जोड़ें', productiveLabel: 'उत्पादक',
    weekdayLabel: 'सप्ताह का दिन', shiftName: 'शिफ्ट नाम', timeEvent: 'समय घटना',
    targetType: 'लक्ष्य प्रकार', targetIdLabel: 'लक्ष्य ID', targetLabelText: 'लक्ष्य लेबल',
    noShiftAssignmentsYet: 'अभी कोई शिफ्ट असाइनमेंट नहीं है।', noAssignmentsYet: 'अभी कोई असाइनमेंट नहीं है।',
    noLineAvailable: 'कोई लाइन उपलब्ध नहीं है', noStationAvailable: 'कोई स्टेशन उपलब्ध नहीं है',
    selectWeekday: 'सप्ताह का दिन चुनें', shiftModellNameRequired: 'शिफ्ट मॉडल नाम (आवश्यक)',
    shiftNamePlaceholder: 'शिफ्ट नाम',
    weekdayMonday: 'सोमवार', weekdayTuesday: 'मंगलवार', weekdayWednesday: 'बुधवार', weekdayThursday: 'गुरुवार',
    weekdayFriday: 'शुक्रवार', weekdaySaturday: 'शनिवार', weekdaySunday: 'रविवार'
  },
  hu: {
    start: 'Kezdet', end: 'Vege', duration: 'Idotartam', idLabel: 'ID',
    yesLabel: 'Igen', noLabel: 'Nem', addLabel: 'Hozzaad', productiveLabel: 'Produktiv',
    weekdayLabel: 'Het napja', shiftName: 'Muszak neve', timeEvent: 'Idoesemeny',
    targetType: 'Cel tipusa', targetIdLabel: 'Cel ID', targetLabelText: 'Cel cimke',
    noShiftAssignmentsYet: 'Meg nincsenek muszakhozzarendelesek.', noAssignmentsYet: 'Meg nincsenek hozzarendelesek.',
    noLineAvailable: 'Nincs elerheto vonal', noStationAvailable: 'Nincs elerheto allomas',
    selectWeekday: 'Valassz hetnapot', shiftModellNameRequired: 'Muszakmodell neve (kotelezo)',
    shiftNamePlaceholder: 'Muszak neve',
    weekdayMonday: 'Hetfo', weekdayTuesday: 'Kedd', weekdayWednesday: 'Szerda', weekdayThursday: 'Csutortok',
    weekdayFriday: 'Pentek', weekdaySaturday: 'Szombat', weekdaySunday: 'Vasarnap'
  }
};

Object.keys(TABLE_RUNTIME_I18N).forEach((lang) => {
  if (!I18N[lang]) I18N[lang] = {};
  Object.assign(I18N[lang], TABLE_RUNTIME_I18N[lang]);
});

const TABLE_HEADER_I18N = {
  es: { stationId: 'ID estacion', lineId: 'ID linea', description: 'Descripcion', bottleneck: 'Cuello de botella', cycleTime: 'Tiempo de ciclo (s)', action: 'Accion' },
  ko: { stationId: '스테이션 ID', lineId: '라인 ID', description: '설명', bottleneck: '병목', cycleTime: '사이클 시간 (초)', action: '작업' },
  zh: { stationId: '工位 ID', lineId: '产线 ID', description: '描述', bottleneck: '瓶颈', cycleTime: '周期时间 (秒)', action: '操作' },
  ru: { stationId: 'ID станции', lineId: 'ID линии', description: 'Описание', bottleneck: 'Узкое место', cycleTime: 'Время цикла (с)', action: 'Действие' },
  fr: { stationId: 'ID station', lineId: 'ID ligne', description: 'Description', bottleneck: 'Goulot d etranglement', cycleTime: 'Temps de cycle (s)', action: 'Action' },
  pt: { stationId: 'ID estacao', lineId: 'ID linha', description: 'Descricao', bottleneck: 'Gargalo', cycleTime: 'Tempo de ciclo (s)', action: 'Acao' },
  ja: { stationId: 'ステーションID', lineId: 'ラインID', description: '説明', bottleneck: 'ボトルネック', cycleTime: 'サイクルタイム (秒)', action: '操作' },
  sk: { stationId: 'ID stanice', lineId: 'ID linky', description: 'Popis', bottleneck: 'Uzke miesto', cycleTime: 'Cas cyklu (s)', action: 'Akcia' },
  tr: { stationId: 'Istasyon ID', lineId: 'Hat ID', description: 'Aciklama', bottleneck: 'Darbogaz', cycleTime: 'Dongu suresi (sn)', action: 'Islem' },
  it: { stationId: 'ID stazione', lineId: 'ID linea', description: 'Descrizione', bottleneck: 'Collo di bottiglia', cycleTime: 'Tempo ciclo (s)', action: 'Azione' },
  hi: { stationId: 'स्टेशन ID', lineId: 'लाइन ID', description: 'विवरण', bottleneck: 'बॉटलनेक', cycleTime: 'साइकिल समय (से.)', action: 'कार्रवाई' },
  hu: { stationId: 'Allomas ID', lineId: 'Sor ID', description: 'Leiras', bottleneck: 'Szuk keresztmetszet', cycleTime: 'Ciklusido (mp)', action: 'Muvelet' }
};

Object.keys(TABLE_HEADER_I18N).forEach((lang) => {
  if (!I18N[lang]) I18N[lang] = {};
  Object.assign(I18N[lang], TABLE_HEADER_I18N[lang]);
});

const CATALOG_TITLE_I18N = {
  en: 'Plant Master Data Catalog',
  de: 'Werkstammdaten',
  es: 'Catalogo de datos maestros de planta',
  ko: '플랜트 마스터데이터 카탈로그',
  zh: '工厂主数据目录',
  ru: 'Каталог основных данных завода',
  fr: 'Catalogue des donnees de base usine',
  pt: 'Catalogo de dados mestres da planta',
  ja: 'プラントマスターデータカタログ',
  sk: 'Katalog kmenovych udajov zavodu',
  tr: 'Tesis ana veri katalogu',
  it: 'Catalogo dati principali impianto',
  hi: 'प्लांट मास्टर डेटा कैटलॉग',
  hu: 'Uzemi torzsadat katalogus'
};

Object.keys(CATALOG_TITLE_I18N).forEach((lang) => {
  if (!I18N[lang]) I18N[lang] = {};
  I18N[lang].masterDataPlantCatalog = CATALOG_TITLE_I18N[lang];
});

const AUTH_DIALOG_I18N = {
  en: {
    entraSsoButton: 'Entra SSO',
    checkEntraButton: 'Check Entra',
    authHintEntra: 'Entra SSO uses a popup sign-in. Username is optional and used as login hint.',
    authHintAdHeader: 'AD-header relies on upstream authentication headers. No credentials required here.',
    authHintCredentials: 'Use username/password login for this provider.',
    entraCheckingConfig: 'Checking Entra configuration...',
    entraNotConfigured: 'Entra is not configured on backend. Missing ENTRA_CLIENT_ID.',
    entraReadyPrefix: 'Entra ready.',
    tenantLabelShort: 'Tenant',
    scopesLabelShort: 'Scopes',
    oboLabelShort: 'OBO',
    disabledLabel: 'disabled',
    entraStatusChecking: 'Checking',
    entraStatusReady: 'Ready',
    entraStatusNotConfigured: 'Not configured',
    entraStatusError: 'Error'
  },
  de: {
    entraSsoButton: 'Entra SSO',
    checkEntraButton: 'Entra prüfen',
    authHintEntra: 'Entra SSO nutzt ein Popup-Login. Benutzername ist optional und dient als Login-Hinweis.',
    authHintAdHeader: 'AD-Header verwendet vorgelagerte Authentifizierungs-Header. Hier sind keine Zugangsdaten nötig.',
    authHintCredentials: 'Für diesen Anbieter bitte Anmeldung mit Benutzername/Passwort nutzen.',
    entraCheckingConfig: 'Entra-Konfiguration wird geprüft...',
    entraNotConfigured: 'Entra ist im Backend nicht konfiguriert. ENTRA_CLIENT_ID fehlt.',
    entraReadyPrefix: 'Entra bereit.',
    tenantLabelShort: 'Mandant',
    scopesLabelShort: 'Scopes',
    oboLabelShort: 'OBO',
    disabledLabel: 'deaktiviert',
    entraStatusChecking: 'Pruefung',
    entraStatusReady: 'Bereit',
    entraStatusNotConfigured: 'Nicht konfiguriert',
    entraStatusError: 'Fehler'
  },
  es: {
    entraSsoButton: 'Entra SSO',
    checkEntraButton: 'Comprobar Entra',
    authHintEntra: 'Entra SSO usa inicio de sesión por ventana emergente. El usuario es opcional y se usa como sugerencia de inicio.',
    authHintAdHeader: 'AD-header depende de cabeceras de autenticación ascendentes. No se requieren credenciales aquí.',
    authHintCredentials: 'Use inicio de sesión con usuario y contraseña para este proveedor.',
    entraCheckingConfig: 'Comprobando configuración de Entra...',
    entraNotConfigured: 'Entra no está configurado en backend. Falta ENTRA_CLIENT_ID.',
    entraReadyPrefix: 'Entra listo.',
    tenantLabelShort: 'Tenant',
    scopesLabelShort: 'Scopes',
    oboLabelShort: 'OBO',
    disabledLabel: 'deshabilitado',
    entraStatusChecking: 'Comprobando',
    entraStatusReady: 'Listo',
    entraStatusNotConfigured: 'Sin configurar',
    entraStatusError: 'Error'
  },
  ko: {
    entraSsoButton: 'Entra SSO',
    checkEntraButton: 'Entra 확인',
    authHintEntra: 'Entra SSO는 팝업 로그인 방식을 사용합니다. 사용자명은 선택사항이며 로그인 힌트로 사용됩니다.',
    authHintAdHeader: 'AD-header는 상위 인증 헤더에 의존합니다. 여기서는 자격 증명이 필요하지 않습니다.',
    authHintCredentials: '이 제공자는 사용자명/비밀번호 로그인을 사용하세요.',
    entraCheckingConfig: 'Entra 구성을 확인하는 중...',
    entraNotConfigured: '백엔드에 Entra가 구성되지 않았습니다. ENTRA_CLIENT_ID가 없습니다.',
    entraReadyPrefix: 'Entra 준비 완료.',
    tenantLabelShort: '테넌트',
    scopesLabelShort: '스코프',
    oboLabelShort: 'OBO',
    disabledLabel: '비활성',
    entraStatusChecking: '확인 중',
    entraStatusReady: '준비됨',
    entraStatusNotConfigured: '미구성',
    entraStatusError: '오류'
  },
  zh: {
    entraSsoButton: 'Entra 单点登录',
    checkEntraButton: '检查 Entra',
    authHintEntra: 'Entra 单点登录使用弹窗登录。用户名可选，仅作为登录提示。',
    authHintAdHeader: 'AD-header 依赖上游认证头，此处不需要凭据。',
    authHintCredentials: '该提供方请使用用户名/密码登录。',
    entraCheckingConfig: '正在检查 Entra 配置...',
    entraNotConfigured: '后端尚未配置 Entra。缺少 ENTRA_CLIENT_ID。',
    entraReadyPrefix: 'Entra 已就绪。',
    tenantLabelShort: '租户',
    scopesLabelShort: '范围',
    oboLabelShort: 'OBO',
    disabledLabel: '已禁用',
    entraStatusChecking: '检查中',
    entraStatusReady: '就绪',
    entraStatusNotConfigured: '未配置',
    entraStatusError: '错误'
  },
  ru: {
    entraSsoButton: 'Entra SSO',
    checkEntraButton: 'Проверить Entra',
    authHintEntra: 'Entra SSO использует вход через всплывающее окно. Имя пользователя необязательно и используется как подсказка.',
    authHintAdHeader: 'AD-header опирается на внешние заголовки аутентификации. Здесь учетные данные не нужны.',
    authHintCredentials: 'Для этого провайдера используйте вход по имени пользователя и паролю.',
    entraCheckingConfig: 'Проверка конфигурации Entra...',
    entraNotConfigured: 'Entra не настроен на backend. Отсутствует ENTRA_CLIENT_ID.',
    entraReadyPrefix: 'Entra готов.',
    tenantLabelShort: 'Tenant',
    scopesLabelShort: 'Scopes',
    oboLabelShort: 'OBO',
    disabledLabel: 'отключено',
    entraStatusChecking: 'Проверка',
    entraStatusReady: 'Готово',
    entraStatusNotConfigured: 'Не настроено',
    entraStatusError: 'Ошибка'
  },
  fr: {
    entraSsoButton: 'Entra SSO',
    checkEntraButton: 'Verifier Entra',
    authHintEntra: 'Entra SSO utilise une connexion par fenetre contextuelle. Le nom utilisateur est optionnel et sert d indice.',
    authHintAdHeader: 'AD-header repose sur des en-tetes d authentification en amont. Aucune credentiel n est requise ici.',
    authHintCredentials: 'Utilisez une connexion nom utilisateur/mot de passe pour ce fournisseur.',
    entraCheckingConfig: 'Verification de la configuration Entra...',
    entraNotConfigured: 'Entra n est pas configure sur le backend. ENTRA_CLIENT_ID manquant.',
    entraReadyPrefix: 'Entra pret.',
    tenantLabelShort: 'Tenant',
    scopesLabelShort: 'Scopes',
    oboLabelShort: 'OBO',
    disabledLabel: 'desactive',
    entraStatusChecking: 'Verification',
    entraStatusReady: 'Pret',
    entraStatusNotConfigured: 'Non configure',
    entraStatusError: 'Erreur'
  },
  pt: {
    entraSsoButton: 'Entra SSO',
    checkEntraButton: 'Verificar Entra',
    authHintEntra: 'O Entra SSO usa login por popup. O nome de usuario e opcional e usado como dica de login.',
    authHintAdHeader: 'AD-header depende de cabecalhos de autenticacao externos. Nenhuma credencial e necessaria aqui.',
    authHintCredentials: 'Use login com usuario/senha para este provedor.',
    entraCheckingConfig: 'Verificando configuracao do Entra...',
    entraNotConfigured: 'Entra nao configurado no backend. Falta ENTRA_CLIENT_ID.',
    entraReadyPrefix: 'Entra pronto.',
    tenantLabelShort: 'Tenant',
    scopesLabelShort: 'Scopes',
    oboLabelShort: 'OBO',
    disabledLabel: 'desativado',
    entraStatusChecking: 'Verificando',
    entraStatusReady: 'Pronto',
    entraStatusNotConfigured: 'Nao configurado',
    entraStatusError: 'Erro'
  },
  ja: {
    entraSsoButton: 'Entra SSO',
    checkEntraButton: 'Entra 確認',
    authHintEntra: 'Entra SSO はポップアップサインインを使用します。ユーザー名は任意で、ログインヒントとして使われます。',
    authHintAdHeader: 'AD-header は上流の認証ヘッダーを利用します。ここで資格情報は不要です。',
    authHintCredentials: 'このプロバイダーではユーザー名/パスワードでログインしてください。',
    entraCheckingConfig: 'Entra 設定を確認中...',
    entraNotConfigured: 'バックエンドで Entra が設定されていません。ENTRA_CLIENT_ID がありません。',
    entraReadyPrefix: 'Entra 準備完了。',
    tenantLabelShort: 'テナント',
    scopesLabelShort: 'スコープ',
    oboLabelShort: 'OBO',
    disabledLabel: '無効',
    entraStatusChecking: '確認中',
    entraStatusReady: '準備完了',
    entraStatusNotConfigured: '未設定',
    entraStatusError: 'エラー'
  },
  sk: {
    entraSsoButton: 'Entra SSO',
    checkEntraButton: 'Skontrolovat Entra',
    authHintEntra: 'Entra SSO pouziva prihlasenie cez popup. Pouzivatelske meno je volitelne a sluzi ako napoveda.',
    authHintAdHeader: 'AD-header sa spolieha na nadradene autentifikacne hlavicky. Tu nie su potrebne prihlasovacie udaje.',
    authHintCredentials: 'Pre tohto poskytovatela pouzite prihlasenie menom a heslom.',
    entraCheckingConfig: 'Kontroluje sa konfiguracia Entra...',
    entraNotConfigured: 'Entra nie je nakonfigurovane na backende. Chyba ENTRA_CLIENT_ID.',
    entraReadyPrefix: 'Entra je pripravene.',
    tenantLabelShort: 'Tenant',
    scopesLabelShort: 'Scopes',
    oboLabelShort: 'OBO',
    disabledLabel: 'vypnute',
    entraStatusChecking: 'Kontrola',
    entraStatusReady: 'Pripravene',
    entraStatusNotConfigured: 'Nekonfigurovane',
    entraStatusError: 'Chyba'
  },
  tr: {
    entraSsoButton: 'Entra SSO',
    checkEntraButton: 'Entra Kontrol Et',
    authHintEntra: 'Entra SSO popup girisi kullanir. Kullanici adi opsiyoneldir ve giris ipucu olarak kullanilir.',
    authHintAdHeader: 'AD-header ust kimlik dogrulama basliklarina dayanir. Burada kimlik bilgisi gerekmez.',
    authHintCredentials: 'Bu saglayici icin kullanici adi/sifre ile giris yapin.',
    entraCheckingConfig: 'Entra yapilandirmasi kontrol ediliyor...',
    entraNotConfigured: 'Entra backend tarafinda yapilandirilmamis. ENTRA_CLIENT_ID eksik.',
    entraReadyPrefix: 'Entra hazir.',
    tenantLabelShort: 'Tenant',
    scopesLabelShort: 'Scopes',
    oboLabelShort: 'OBO',
    disabledLabel: 'devre disi',
    entraStatusChecking: 'Kontrol ediliyor',
    entraStatusReady: 'Hazir',
    entraStatusNotConfigured: 'Yapilandirilmamis',
    entraStatusError: 'Hata'
  },
  it: {
    entraSsoButton: 'Entra SSO',
    checkEntraButton: 'Verifica Entra',
    authHintEntra: 'Entra SSO usa l accesso tramite popup. Il nome utente e facoltativo e usato come suggerimento di accesso.',
    authHintAdHeader: 'AD-header dipende da header di autenticazione a monte. Qui non sono richieste credenziali.',
    authHintCredentials: 'Per questo provider usa accesso con nome utente/password.',
    entraCheckingConfig: 'Verifica configurazione Entra in corso...',
    entraNotConfigured: 'Entra non configurato sul backend. Manca ENTRA_CLIENT_ID.',
    entraReadyPrefix: 'Entra pronto.',
    tenantLabelShort: 'Tenant',
    scopesLabelShort: 'Scopes',
    oboLabelShort: 'OBO',
    disabledLabel: 'disabilitato',
    entraStatusChecking: 'Verifica',
    entraStatusReady: 'Pronto',
    entraStatusNotConfigured: 'Non configurato',
    entraStatusError: 'Errore'
  },
  hi: {
    entraSsoButton: 'Entra SSO',
    checkEntraButton: 'Entra जांचें',
    authHintEntra: 'Entra SSO पॉपअप साइन-इन का उपयोग करता है। उपयोगकर्ता नाम वैकल्पिक है और लॉगिन संकेत के रूप में उपयोग होता है।',
    authHintAdHeader: 'AD-header अपस्ट्रीम प्रमाणीकरण हेडर पर निर्भर है। यहां क्रेडेंशियल्स की आवश्यकता नहीं है।',
    authHintCredentials: 'इस प्रदाता के लिए उपयोगकर्ता नाम/पासवर्ड लॉगिन उपयोग करें।',
    entraCheckingConfig: 'Entra कॉन्फ़िगरेशन जांची जा रही है...',
    entraNotConfigured: 'बैकएंड पर Entra कॉन्फ़िगर नहीं है। ENTRA_CLIENT_ID गायब है।',
    entraReadyPrefix: 'Entra तैयार है।',
    tenantLabelShort: 'Tenant',
    scopesLabelShort: 'Scopes',
    oboLabelShort: 'OBO',
    disabledLabel: 'अक्षम',
    entraStatusChecking: 'जांच जारी',
    entraStatusReady: 'तैयार',
    entraStatusNotConfigured: 'कॉन्फ़िगर नहीं',
    entraStatusError: 'त्रुटि'
  },
  hu: {
    entraSsoButton: 'Entra SSO',
    checkEntraButton: 'Entra ellenorzese',
    authHintEntra: 'Az Entra SSO felugro bejelentkezest hasznal. A felhasznalonev opcionális, bejelentkezesi tippkent szolgal.',
    authHintAdHeader: 'Az AD-header felso szintu hitelesitesi fejlecekre tamaszkodik. Itt nincs szukseg hitelesitesi adatokra.',
    authHintCredentials: 'Ehhez a szolgaltatohoz felhasznalonev/jelszo bejelentkezest hasznalj.',
    entraCheckingConfig: 'Entra konfiguracio ellenorzese...',
    entraNotConfigured: 'Az Entra nincs beallitva a backendben. Hianyzik az ENTRA_CLIENT_ID.',
    entraReadyPrefix: 'Entra kesz.',
    tenantLabelShort: 'Tenant',
    scopesLabelShort: 'Scopes',
    oboLabelShort: 'OBO',
    disabledLabel: 'letiltva',
    entraStatusChecking: 'Ellenorzes',
    entraStatusReady: 'Kesz',
    entraStatusNotConfigured: 'Nincs beallitva',
    entraStatusError: 'Hiba'
  }
};

Object.keys(AUTH_DIALOG_I18N).forEach((lang) => {
  if (!I18N[lang]) I18N[lang] = {};
  Object.assign(I18N[lang], AUTH_DIALOG_I18N[lang]);
});

function tr(key) {
  const langPack = I18N[currentLang] || I18N.en;
  return langPack[key] || I18N.en[key] || key;
}

function getLanguage() {
  try {
    const lang = localStorage.getItem(LANG_STORAGE_KEY) || 'de';
    return I18N[lang] ? lang : 'de';
  } catch (_) {
    return 'de';
  }
}

const RUNTIME_TRANSLATIONS = {
  'Please provide an API token.': {
    de: 'Bitte API-Token eingeben.', es: 'Proporcione un token de API.', ko: 'API 토큰을 입력하세요.', zh: '请输入 API 令牌。', ru: 'Укажите API-токен.', fr: 'Veuillez fournir un jeton API.'
  },
  'API token applied.': {
    de: 'API-Token angewendet.', es: 'Token API aplicado.', ko: 'API 토큰이 적용되었습니다.', zh: 'API 令牌已应用。', ru: 'API-токен применен.', fr: 'Jeton API appliqué.'
  },
  'Manual bearer token active.': {
    de: 'Manueller Bearer-Token aktiv.', es: 'Token bearer manual activo.', ko: '수동 Bearer 토큰 활성.', zh: '手动 Bearer 令牌已激活。', ru: 'Ручной bearer-токен активен.', fr: 'Jeton bearer manuel actif.'
  },
  'Login successful.': {
    de: 'Login erfolgreich.', es: 'Inicio de sesión exitoso.', ko: '로그인 성공.', zh: '登录成功。', ru: 'Вход выполнен.', fr: 'Connexion réussie.'
  },
  'Login failed.': {
    de: 'Login fehlgeschlagen.', es: 'Error de inicio de sesión.', ko: '로그인 실패.', zh: '登录失败。', ru: 'Ошибка входа.', fr: 'Échec de la connexion.'
  },
  'No refresh token available. Login first.': {
    de: 'Kein Refresh-Token verfügbar. Bitte zuerst anmelden.', es: 'No hay token de actualización. Inicie sesión primero.', ko: '리프레시 토큰이 없습니다. 먼저 로그인하세요.', zh: '没有刷新令牌，请先登录。', ru: 'Нет refresh-токена. Сначала войдите.', fr: 'Aucun jeton de rafraîchissement disponible. Connectez-vous d\'abord.'
  },
  'Session refreshed.': {
    de: 'Sitzung aktualisiert.', es: 'Sesión actualizada.', ko: '세션이 갱신되었습니다.', zh: '会话已刷新。', ru: 'Сессия обновлена.', fr: 'Session rafraîchie.'
  },
  'Refresh failed.': {
    de: 'Aktualisierung fehlgeschlagen.', es: 'Error al refrescar.', ko: '새로고침 실패.', zh: '刷新失败。', ru: 'Ошибка обновления сессии.', fr: 'Échec du rafraîchissement.'
  },
  'Logged out.': {
    de: 'Abgemeldet.', es: 'Sesión cerrada.', ko: '로그아웃되었습니다.', zh: '已登出。', ru: 'Вы вышли.', fr: 'Déconnecté.'
  },
  'Username and password are required.': {
    de: 'Benutzername und Passwort sind erforderlich.', es: 'Se requieren usuario y contraseña.', ko: '사용자명과 비밀번호가 필요합니다.', zh: '需要用户名和密码。', ru: 'Требуются имя пользователя и пароль.', fr: 'Nom d\'utilisateur et mot de passe requis.'
  },
  'User created successfully.': {
    de: 'Benutzer erfolgreich erstellt.', es: 'Usuario creado correctamente.', ko: '사용자가 생성되었습니다.', zh: '用户创建成功。', ru: 'Пользователь успешно создан.', fr: 'Utilisateur créé avec succès.'
  },
  'Please select a permission to grant.': {
    de: 'Bitte eine Berechtigung zum Erteilen auswählen.', es: 'Seleccione un permiso para otorgar.', ko: '부여할 권한을 선택하세요.', zh: '请选择要授予的权限。', ru: 'Выберите право для выдачи.', fr: 'Sélectionnez une permission à accorder.'
  },
  'Please select a permission to revoke.': {
    de: 'Bitte eine Berechtigung zum Entziehen auswählen.', es: 'Seleccione un permiso para revocar.', ko: '회수할 권한을 선택하세요.', zh: '请选择要撤销的权限。', ru: 'Выберите право для отзыва.', fr: 'Sélectionnez une permission à révoquer.'
  },
  'Loading admin data failed.': {
    de: 'Admin-Daten konnten nicht geladen werden.', es: 'No se pudieron cargar los datos de administrador.', ko: '관리자 데이터 로드 실패.', zh: '加载管理员数据失败。', ru: 'Не удалось загрузить данные администратора.', fr: 'Échec du chargement des données administrateur.'
  },
  'No assignments to save!': {
    de: 'Keine Zuordnungen zum Speichern!', es: 'No hay asignaciones para guardar.', ko: '저장할 할당이 없습니다!', zh: '没有可保存的分配。', ru: 'Нет назначений для сохранения!', fr: 'Aucune affectation à enregistrer.'
  },
  'All master data and assignments were sent to InfluxDB!': {
    de: 'Alle Stammdaten und Zuordnungen wurden an InfluxDB gesendet!', es: 'Todos los datos maestros y asignaciones se enviaron a InfluxDB.', ko: '모든 기준 데이터와 할당이 InfluxDB로 전송되었습니다!', zh: '所有主数据和分配已发送到 InfluxDB！', ru: 'Все мастер-данные и назначения отправлены в InfluxDB!', fr: 'Toutes les données de base et affectations ont été envoyées à InfluxDB.'
  },
  'Please select shift modell, target type, and target.': {
    de: 'Bitte Schichtmodell, Zieltyp und Ziel auswählen.', es: 'Seleccione modelo de turno, tipo de destino y destino.', ko: '교대 모델, 대상 유형, 대상을 선택하세요.', zh: '请选择班次模型、目标类型和目标。', ru: 'Выберите модель смены, тип цели и цель.', fr: 'Sélectionnez le modèle de poste, le type de cible et la cible.'
  },
  'Selected Shift Modell is empty or not found.': {
    de: 'Gewähltes Schichtmodell ist leer oder nicht gefunden.', es: 'El modelo de turno seleccionado está vacío o no existe.', ko: '선택한 교대 모델이 비어 있거나 없습니다.', zh: '所选班次模型为空或未找到。', ru: 'Выбранная модель смены пуста или не найдена.', fr: 'Le modèle de poste sélectionné est vide ou introuvable.'
  },
  'Session token available.': {
    de: 'Sitzungs-Token verfügbar.', es: 'Token de sesión disponible.', ko: '세션 토큰 사용 가능.', zh: '会话令牌可用。', ru: 'Токен сессии доступен.', fr: 'Jeton de session disponible.'
  },
  'Legacy/manual token mode.': {
    de: 'Legacy/manueller Token-Modus.', es: 'Modo de token heredado/manual.', ko: '레거시/수동 토큰 모드.', zh: '传统/手动令牌模式。', ru: 'Режим legacy/ручного токена.', fr: 'Mode de jeton héritage/manuel.'
  }
};

function translateRuntimeText(text) {
  const raw = String(text || '');
  const exact = RUNTIME_TRANSLATIONS[raw];
  if (exact && exact[currentLang]) return exact[currentLang];

  // Backend error mapping (status hints and common API error details)
  const backendErrorMap = {
    'The request data is invalid.': {
      de: 'Die Anfragedaten sind ungültig.', es: 'Los datos de la solicitud no son válidos.', ko: '요청 데이터가 잘못되었습니다.', zh: '请求数据无效。', ru: 'Данные запроса недействительны.', fr: 'Les données de la requête sont invalides.', pt: 'Os dados da solicitação são inválidos.', ja: 'リクエストデータが無効です。', sk: 'Požadované údaje sú neplatné.', tr: 'İstek verileri geçersiz.'
    },
    'Authentication is required.': {
      de: 'Authentifizierung erforderlich.', es: 'Autenticación requerida.', ko: '인증이 필요합니다.', zh: '需要身份验证。', ru: 'Требуется аутентификация.', fr: 'Authentification requise.', pt: 'Autenticação necessária.', ja: '認証が必要です。', sk: 'Je potrebné overenie.', tr: 'Kimlik doğrulama gerekli.'
    },
    'Access is denied.': {
      de: 'Zugriff verweigert.', es: 'Acceso denegado.', ko: '접근이 거부되었습니다.', zh: '拒绝访问。', ru: 'Доступ запрещен.', fr: 'Accès refusé.', pt: 'Acesso negado.', ja: 'アクセスが拒否されました。', sk: 'Prístup bol zamietnutý.', tr: 'Erişim reddedildi.'
    },
    'The requested API endpoint was not found.': {
      de: 'API-Endpunkt nicht gefunden.', es: 'Punto final de API no encontrado.', ko: '요청한 API 엔드포인트를 찾을 수 없습니다.', zh: '未找到请求的 API 端点。', ru: 'Запрошенный API-эндпоинт не найден.', fr: 'Point de terminaison API non trouvé.', pt: 'Endpoint de API solicitado não encontrado.', ja: '要求されたAPIエンドポイントが見つかりません。', sk: 'Požadovaný API endpoint nebol nájdený.', tr: 'İstenen API uç noktası bulunamadı.'
    },
    'The server failed while processing the request.': {
      de: 'Serverfehler bei der Verarbeitung der Anfrage.', es: 'El servidor falló al procesar la solicitud.', ko: '요청 처리 중 서버 오류.', zh: '服务器处理请求失败。', ru: 'Сервер не смог обработать запрос.', fr: 'Le serveur a échoué lors du traitement de la requête.', pt: 'O servidor falhou ao processar a solicitação.', ja: 'サーバーがリクエストの処理に失敗しました。', sk: 'Server zlyhal pri spracovaní požiadavky.', tr: 'Sunucu isteği işlerken başarısız oldu.'
    },
    'The backend service is temporarily unavailable.': {
      de: 'Backend-Dienst vorübergehend nicht verfügbar.', es: 'El servicio backend no está disponible temporalmente.', ko: '백엔드 서비스가 일시적으로 사용할 수 없습니다.', zh: '后端服务暂时不可用。', ru: 'Бэкенд временно недоступен.', fr: 'Le service backend est temporairement indisponible.', pt: 'O serviço backend está temporariamente indisponível.', ja: 'バックエンドサービスは一時的に利用できません。', sk: 'Backend služba je dočasne nedostupná.', tr: 'Backend servisi geçici olarak kullanılamıyor.'
    },
    'Request timed out.': {
      de: 'Zeitüberschreitung bei der Anfrage.', es: 'Tiempo de espera de la solicitud agotado.', ko: '요청 시간이 초과되었습니다.', zh: '请求超时。', ru: 'Время ожидания запроса истекло.', fr: 'Délai d\'attente de la requête dépassé.', pt: 'Tempo de solicitação esgotado.', ja: 'リクエストがタイムアウトしました。', sk: 'Čas požiadavky vypršal.', tr: 'İstek zaman aşımına uğradı.'
    },
    'Network error or backend unavailable.': {
      de: 'Netzwerkfehler oder Backend nicht erreichbar.', es: 'Error de red o backend no disponible.', ko: '네트워크 오류 또는 백엔드 사용 불가.', zh: '网络错误或后端不可用。', ru: 'Сетевая ошибка или бэкенд недоступен.', fr: 'Erreur réseau ou backend indisponible.', pt: 'Erro de rede ou backend indisponível.', ja: 'ネットワークエラーまたはバックエンドが利用できません。', sk: 'Chyba siete alebo backend nedostupný.', tr: 'Ağ hatası veya backend kullanılamıyor.'
    }
  };
  // Replace backend error hints in text
  let mapped = raw;
  Object.keys(backendErrorMap).forEach((en) => {
    if (mapped.includes(en) && backendErrorMap[en][currentLang]) {
      mapped = mapped.replace(en, backendErrorMap[en][currentLang]);
    }
  });
  if (mapped !== raw) return mapped;

  let m = raw.match(/^Logged in as (.+) \((.+)\)$/);
  if (m) {
    if (currentLang === 'de') return `Angemeldet als ${m[1]} (${m[2]})`;
    if (currentLang === 'es') return `Sesion iniciada como ${m[1]} (${m[2]})`;
    if (currentLang === 'ko') return `${m[1]} (${m[2]}) 로 로그인됨`;
    if (currentLang === 'zh') return `已登录为 ${m[1]} (${m[2]})`;
    if (currentLang === 'ru') return `Вход выполнен: ${m[1]} (${m[2]})`;
    if (currentLang === 'fr') return `Connecte en tant que ${m[1]} (${m[2]})`;
  }

  m = raw.match(/^Session refreshed \((.+)\)$/);
  if (m) {
    if (currentLang === 'de') return `Sitzung aktualisiert (${m[1]})`;
    if (currentLang === 'es') return `Sesion actualizada (${m[1]})`;
    if (currentLang === 'ko') return `세션 갱신됨 (${m[1]})`;
    if (currentLang === 'zh') return `会话已刷新 (${m[1]})`;
    if (currentLang === 'ru') return `Сессия обновлена (${m[1]})`;
    if (currentLang === 'fr') return `Session rafraichie (${m[1]})`;
  }

  m = raw.match(/^Delete user '(.+)'\?$/);
  if (m) {
    if (currentLang === 'de') return `Benutzer '${m[1]}' loschen?`;
    if (currentLang === 'es') return `Eliminar usuario '${m[1]}'?`;
    if (currentLang === 'ko') return `사용자 '${m[1]}' 을 삭제할까요?`;
    if (currentLang === 'zh') return `删除用户 '${m[1]}' 吗？`;
    if (currentLang === 'ru') return `Удалить пользователя '${m[1]}'?`;
    if (currentLang === 'fr') return `Supprimer l'utilisateur '${m[1]}' ?`;
  }

  m = raw.match(/^Shift modell assigned: (\d+) successful(?:, (\d+) failed)?$/);
  if (m) {
    const ok = m[1];
    const fail = m[2] || '0';
    if (currentLang === 'de') return `Schichtmodell zugewiesen: ${ok} erfolgreich${m[2] ? `, ${fail} fehlgeschlagen` : ''}`;
    if (currentLang === 'es') return `Modelo de turno asignado: ${ok} correcto${m[2] ? `, ${fail} fallido` : ''}`;
    if (currentLang === 'ko') return `교대 모델 할당: ${ok} 성공${m[2] ? `, ${fail} 실패` : ''}`;
    if (currentLang === 'zh') return `班次模型分配: ${ok} 成功${m[2] ? `, ${fail} 失败` : ''}`;
    if (currentLang === 'ru') return `Модель смены назначена: ${ok} успешно${m[2] ? `, ${fail} ошибок` : ''}`;
    if (currentLang === 'fr') return `Modele de poste assigne: ${ok} reussi${m[2] ? `, ${fail} echoue` : ''}`;
  }

  m = raw.match(/^Assignments saved: (\d+) successful(?:, (\d+) failed)?$/);
  if (m) {
    const ok = m[1];
    const fail = m[2] || '0';
    if (currentLang === 'de') return `Zuordnungen gespeichert: ${ok} erfolgreich${m[2] ? `, ${fail} fehlgeschlagen` : ''}`;
    if (currentLang === 'es') return `Asignaciones guardadas: ${ok} correctas${m[2] ? `, ${fail} fallidas` : ''}`;
    if (currentLang === 'ko') return `할당 저장: ${ok} 성공${m[2] ? `, ${fail} 실패` : ''}`;
    if (currentLang === 'zh') return `分配已保存: ${ok} 成功${m[2] ? `, ${fail} 失败` : ''}`;
    if (currentLang === 'ru') return `Назначения сохранены: ${ok} успешно${m[2] ? `, ${fail} ошибок` : ''}`;
    if (currentLang === 'fr') return `Affectations enregistrees: ${ok} reussies${m[2] ? `, ${fail} echouees` : ''}`;
  }

  return raw;
}

if (typeof window !== 'undefined') {
  const nativeAlert = typeof window.alert === 'function' ? window.alert.bind(window) : null;
  const nativeConfirm = typeof window.confirm === 'function' ? window.confirm.bind(window) : null;
  if (nativeAlert) {
    window.alert = function(message) {
      return nativeAlert(translateRuntimeText(message));
    };
  }
  if (nativeConfirm) {
    window.confirm = function(message) {
      return nativeConfirm(translateRuntimeText(message));
    };
  }
}

function applyLanguage() {
  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  }

  function setPlaceholder(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.setAttribute('placeholder', value);
  }

  function setAllByOnclick(onclickValue, value) {
    document.querySelectorAll(`button[onclick="${onclickValue}"]`).forEach((el) => {
      el.textContent = value;
    });
  }

  function setAllByOnclickPrefix(onclickPrefix, value) {
    document.querySelectorAll(`button[onclick^="${onclickPrefix}"]`).forEach((el) => {
      el.textContent = value;
    });
  }

  // Table names
  setText('h4[for-table="stations"]', tr('tableStations'));
  setText('h4[for-table="lines"]', tr('tableLines'));
  setText('h4[for-table="assignments"]', tr('tableAssignments'));
  setText('h4[for-table="timeEvents"]', tr('tableTimeEvents'));
  setText('h4[for-table="shiftModells"]', tr('tableShiftModells'));
  setText('h4[for-table="shiftSchedules"]', tr('tableShiftSchedules'));
  // Dropdowns
  document.querySelectorAll('select').forEach(sel => {
    if (sel.options.length && sel.options[0].value === '') {
      sel.options[0].textContent = tr('dropdownSelect');
    }
  });

  setText('.header-actions button[onclick="openAuthDialog()"]', tr('loginAuth'));
  setText('#authModal .modal-title', tr('authTitle'));
  setText('label[for="masterdataPlant"]', tr('plantLabel'));
  setText('label[for="masterdataTemplateName"]', tr('templateNameLabel'));
  setText('label[for="masterdataTemplateCatalog"]', tr('templateCatalogLabel'));
  setText('.main-content .section:nth-of-type(1) > .mb-2', tr('plantXtotalHint'));
  setText('label[for="headerAuthProviderInput"]', tr('provider'));
  setText('label[for="headerAuthUserInput"]', tr('username'));
  setText('label[for="headerAuthPasswordInput"]', tr('password'));
  setText('label[for="headerAuthOneTimeCodeInput"]', tr('oneTimeCode'));
  setText('#entraSignInBtn', tr('entraSsoButton'));
  setText('#entraConfigBtn', tr('checkEntraButton'));

  setAllByOnclick('loginApiSession()', tr('login'));
  setAllByOnclick('refreshApiSession()', tr('refresh'));
  setAllByOnclick('logoutApiSession()', tr('logout'));
  setAllByOnclick('applyApiTokenFromInput()', tr('applyToken'));
  setAllByOnclick('runSystemHealthCheck()', tr('runHealthCheck'));
  setAllByOnclick('repairSqlIntegrity()', tr('repairSql'));
  setAllByOnclick('refreshApiCatalogInputs()', tr('refreshRecommendations'));
  setAllByOnclick('testSelectedApiEndpoint()', tr('testApi'));
  setAllByOnclick('sendTestPoint()', tr('sendTestPointSql'));
  setAllByOnclick('createManagedUser()', tr('createUser'));
  setAllByOnclick('loadManagedUsers()', tr('reload'));
  setAllByOnclick('storeMasterdataTemplate()', tr('storeAllToDb'));
  setAllByOnclick('exportAllMasterdataExcel()', tr('plantXtotalExport'));
  setAllByOnclick('renameSelectedTemplatePlant()', tr('renamePlant'));
  setAllByOnclickPrefix('grantManagedPermission(', tr('grant'));
  setAllByOnclickPrefix('revokeManagedPermission(', tr('revoke'));
  setAllByOnclickPrefix('deleteManagedUser(', tr('deleteLabel'));

  setAllByOnclick('showStations()', tr('show'));
  setAllByOnclick('editStations()', tr('edit'));
  setAllByOnclick('saveStationsEdit()', tr('saveClose'));
  setAllByOnclick('resetStations()', tr('newLabel'));
  setAllByOnclick('exportExcel(\'stations\')', tr('exportLabel'));

  setAllByOnclick('showLines()', tr('show'));
  setAllByOnclick('editLines()', tr('edit'));
  setAllByOnclick('saveLinesEdit()', tr('saveClose'));
  setAllByOnclick('resetLines()', tr('newLabel'));
  setAllByOnclick('exportExcel(\'lines\')', tr('exportLabel'));

  setAllByOnclick('showAssignments()', tr('show'));
  setAllByOnclick('editAssignments()', tr('edit'));
  setAllByOnclick('saveAssignments()', tr('saveAssignments'));
  setAllByOnclick('resetAssignments()', tr('newLabel'));
  setAllByOnclick('exportExcel(\'assignments\')', tr('exportLabel'));

  setAllByOnclick('showTEs()', tr('show'));
  setAllByOnclick('editTEs()', tr('edit'));
  setAllByOnclick('saveTEsEdit()', tr('saveClose'));
  setAllByOnclick('resetTEs()', tr('newLabel'));
  setAllByOnclick('exportExcel(\'timeEvents\')', tr('exportLabel'));

  setAllByOnclick('showWPs()', tr('show'));
  setAllByOnclick('editWPs()', tr('edit'));
  setAllByOnclick('saveWPsEdit()', tr('saveClose'));
  setAllByOnclick('resetWPs()', tr('newLabel'));
  setAllByOnclick('exportExcel(\'weekPlans\')', tr('exportLabel'));

  setAllByOnclick('showShiftAssignments()', tr('show'));
  setAllByOnclick('editShiftAssignments()', tr('edit'));
  setAllByOnclick('saveShiftAssignmentsEdit()', tr('saveClose'));
  setAllByOnclick('resetShiftAssignments()', tr('newLabel'));
  setAllByOnclick('exportExcel(\'shiftSchedules\')', tr('exportLabel'));

  setText('.main-content .section:nth-of-type(1) h2', tr('masterDataPlantCatalog'));
  setText('.main-content .section:nth-of-type(2) h2', '2. ' + tr('masterData'));
  setText('.main-content .section:nth-of-type(2) h4', tr('stations'));
  setText('.main-content .section:nth-of-type(2) h4.mt-4', tr('lines'));
  setText('.main-content .section:nth-of-type(2) h4:nth-of-type(3)', tr('assignStationsToLines'));
  setText('.main-content .section:nth-of-type(3) h2', '3. ' + tr('timeEvents'));
  setText('.main-content .section:nth-of-type(4) h2', '4. ' + tr('shiftModells'));
  setText('.main-content .section:nth-of-type(5) h2', '5. ' + tr('shiftSchedules'));
  setText('.main-content .section:nth-of-type(5) h4.mt-4', tr('assignShiftModell'));
  setText('.main-content .section:nth-of-type(6) h2', '6. ' + tr('apiQuerySimulator'));
  setText('.main-content .section:nth-of-type(6) h4.mt-3', tr('apiCatalogTester'));

  const masterdataTemplateCatalog = document.getElementById('masterdataTemplateCatalog');
  if (masterdataTemplateCatalog) {
    Array.from(masterdataTemplateCatalog.options || []).forEach((opt) => {
      if (!opt.value) {
        opt.textContent = tr('noTemplatesFound');
        return;
      }
      const templateName = String(opt.dataset?.templateName || '').trim();
      const plant = String(opt.dataset?.plant || '').trim();
      const parts = String(opt.textContent || '').split(' | ');
      const trailingMeta = parts.length > 2 ? parts.slice(2).join(' | ') : '';
      opt.textContent = `${templateName} | ${tr('plantLabel').toLowerCase()}=${plant}${trailingMeta ? ` | ${trailingMeta}` : ''}`;
    });
  }

  const masterdataStatus = document.getElementById('masterdataTemplateStatus');
  if (masterdataStatus) {
    const rawStatus = String(masterdataStatus.textContent || '').trim();
    const loadedMatch = rawStatus.match(/^(?:Template loaded|Vorlage geladen|Modele charge|模板已加载|Plantilla cargada|템플릿 로드됨|Шаблон загружен):\s*(.+)$/i);
    if (loadedMatch) {
      masterdataStatus.textContent = `${tr('templateLoadedPrefix')}: ${loadedMatch[1]}`;
    }
  }

  setText('label[for="apiCatalogSelect"]', tr('endpoint'));
  setText('.main-content .section:nth-of-type(6) .mt-3 label.form-label', tr('result'));
  setText('#apiCatalogResultLabel', tr('result'));
  setText('#assignModal .modal-title', tr('assignStationsToLines'));
  setText('#authAdminPanel h6', tr('adminUserMgmt'));
  setText('.main-content .section:nth-of-type(5) #assignTargetType option[value="station"]', tr('stationSingular'));
  setText('.main-content .section:nth-of-type(5) #assignTargetType option[value="line"]', tr('lineSingular'));
  setText('.main-content .section:nth-of-type(5) button[onclick="assignShiftSchedule()"]', tr('assign'));
  setText('#assignModal .modal-footer .btn-success', tr('saveLabel'));
  setText('#assignModal .modal-footer .btn-secondary', tr('cancelLabel'));

  const assignLabels = document.querySelectorAll('#assignModal .modal-body label.mb-1');
  if (assignLabels.length >= 3) {
    assignLabels[0].textContent = tr('stations');
    assignLabels[1].textContent = tr('lineSingular');
    assignLabels[2].textContent = tr('assignedStations');
  }

  const adminHeaders = document.querySelectorAll('.auth-dialog-table thead th');
  if (adminHeaders.length >= 6) {
    adminHeaders[0].textContent = tr('user');
    adminHeaders[1].textContent = tr('role');
    adminHeaders[2].textContent = tr('enabledLabel');
    adminHeaders[3].textContent = tr('permissionsLabel');
    adminHeaders[4].textContent = tr('grantRevoke');
    adminHeaders[5].textContent = tr('actions');
  }

  const enabledWrap = document.querySelector('#authAdminPanel label.mb-0');
  if (enabledWrap) {
    const cb = enabledWrap.querySelector('input');
    if (cb) {
      enabledWrap.textContent = '';
      enabledWrap.appendChild(cb);
      enabledWrap.append(` ${tr('enabledLabel')}`);
    }
  }

  setPlaceholder('#headerAuthUserInput', tr('username'));
  setPlaceholder('#headerAuthPasswordInput', tr('password'));
  setPlaceholder('#headerAuthOneTimeCodeInput', tr('oneTimeCode6'));
  setPlaceholder('#newManagedUserName', tr('newUsername'));
  setPlaceholder('#newManagedUserPassword', tr('password'));
  setPlaceholder('#newManagedUserPermissions', tr('permissionsCommaSeparated'));
  setPlaceholder('#authUserInput', tr('username'));
  setPlaceholder('#authPasswordInput', tr('password'));
  setPlaceholder('#authOneTimeCodeInput', tr('oneTimeCode6'));
  setPlaceholder('#apiTokenInput', tr('manualBearerToken'));
  setPlaceholder('#apiStId', tr('stationNumber'));

  const legend = document.getElementById('healthCheckLegend');
  if (legend) {
    legend.innerHTML =
      '<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#00e676;margin-right:6px;vertical-align:middle;"></span>' +
      `<b>${tr('green')}:</b> ${tr('healthGreenDesc')}<br>` +
      '<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#ffc107;margin-right:6px;vertical-align:middle;"></span>' +
      `<b>${tr('yellow')}:</b> ${tr('healthYellowDesc')}<br>` +
      '<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#ff3b3b;margin-right:6px;vertical-align:middle;"></span>' +
      `<b>${tr('red')}:</b> ${tr('healthRedDesc')}`;
  }

  const apiHeaders = document.querySelectorAll('#apiResultTable thead th');
  if (apiHeaders.length >= 5) {
    apiHeaders[0].textContent = tr('duration');
    apiHeaders[1].textContent = tr('shiftId');
    apiHeaders[2].textContent = tr('timeEventDesc');
    apiHeaders[3].textContent = tr('start');
    apiHeaders[4].textContent = tr('end');
  }

  document.querySelectorAll('label[for^="import"]').forEach((el) => {
    el.textContent = tr('importLabel');
  });

  // Re-render dynamic tables so generated headers/labels follow current language.
  if (typeof renderStations === 'function') renderStations();
  if (typeof renderLines === 'function') renderLines();
  if (typeof renderAssignments === 'function') renderAssignments();
  if (typeof renderAssignmentsList === 'function') renderAssignmentsList();
  if (typeof renderTEs === 'function') renderTEs();
  if (typeof renderWPs === 'function') renderWPs();
  if (typeof renderAssignedShiftSchedules === 'function') renderAssignedShiftSchedules();
  if (typeof populateApiCatalogUI === 'function') populateApiCatalogUI();

  const langSelect = document.getElementById('langSelect');
  if (langSelect && langSelect.value !== currentLang) {
    langSelect.value = currentLang;
  }

  updateHeaderAuthUser();
  updateAuthDialogProviderUi(getSelectedAuthProvider());
}

function setLanguage(lang) {
  currentLang = I18N[lang] ? lang : 'de';
  try {
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  } catch (_) {
    // Ignore storage failures.
  }
  applyLanguage();
}

window.setLanguage = setLanguage;

function toPermissionArray(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((v) => String(v || '').trim()).filter(Boolean))];
  }
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function getStoredAuthRole() {
  try {
    return localStorage.getItem(API_AUTH_ROLE_STORAGE_KEY) || '';
  } catch (_) {
    return '';
  }
}

function getStoredAuthPermissions() {
  try {
    const raw = localStorage.getItem(API_AUTH_PERMISSIONS_STORAGE_KEY) || '[]';
    return toPermissionArray(JSON.parse(raw));
  } catch (_) {
    return [];
  }
}

function setStoredAuthRole(role) {
  try {
    if (!role) localStorage.removeItem(API_AUTH_ROLE_STORAGE_KEY);
    else localStorage.setItem(API_AUTH_ROLE_STORAGE_KEY, role);
  } catch (_) {
    // Ignore storage failures.
  }
}

function setStoredAuthPermissions(permissions) {
  const list = toPermissionArray(permissions);
  try {
    if (!list.length) localStorage.removeItem(API_AUTH_PERMISSIONS_STORAGE_KEY);
    else localStorage.setItem(API_AUTH_PERMISSIONS_STORAGE_KEY, JSON.stringify(list));
  } catch (_) {
    // Ignore storage failures.
  }
}

function getStoredAuthProvider() {
  try {
    return localStorage.getItem(API_AUTH_PROVIDER_STORAGE_KEY) || '';
  } catch (_) {
    return '';
  }
}

function setStoredAuthProvider(provider) {
  try {
    if (!provider) localStorage.removeItem(API_AUTH_PROVIDER_STORAGE_KEY);
    else localStorage.setItem(API_AUTH_PROVIDER_STORAGE_KEY, String(provider).trim());
  } catch (_) {
    // Ignore storage failures.
  }
}

async function loadEntraConfig() {
  if (!entraConfigPromise) {
    entraConfigPromise = fetch('/api/auth/entra/config')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body?.error || 'Unable to load Entra configuration.');
        }
        return body || {};
      })
      .catch((err) => {
        entraConfigPromise = null;
        throw err;
      });
  }
  return entraConfigPromise;
}

async function getMsalClient() {
  if (!msalClientPromise) {
    msalClientPromise = (async () => {
      if (!window.msal || !window.msal.PublicClientApplication) {
        throw new Error('MSAL Browser library is not loaded.');
      }

      const cfg = await loadEntraConfig();
      if (!cfg.enabled || !cfg.clientId) {
        throw new Error('Entra SSO is not configured on backend (missing ENTRA_CLIENT_ID).');
      }

      const scopes = Array.isArray(cfg.scopes) && cfg.scopes.length
        ? cfg.scopes
        : [`api://${cfg.clientId}/user_impersonation`];

      const pca = new window.msal.PublicClientApplication({
        auth: {
          clientId: cfg.clientId,
          authority: cfg.authority,
          redirectUri: cfg.redirectUri || window.location.origin
        },
        cache: {
          cacheLocation: 'sessionStorage',
          storeAuthStateInCookie: false
        }
      });

      if (typeof pca.initialize === 'function') {
        await pca.initialize();
      }

      return { pca, scopes };
    })().catch((err) => {
      msalClientPromise = null;
      throw err;
    });
  }
  return msalClientPromise;
}

async function acquireEntraAccessTokenInteractive(loginHint) {
  const { pca, scopes } = await getMsalClient();

  const knownAccount = pca.getActiveAccount() || (pca.getAllAccounts()[0] || null);
  if (knownAccount) {
    pca.setActiveAccount(knownAccount);
  }

  let account = pca.getActiveAccount() || null;
  if (!account) {
    const loginRes = await pca.loginPopup({
      scopes,
      loginHint: loginHint || undefined,
      prompt: 'select_account'
    });
    account = loginRes?.account || null;
    if (account) {
      pca.setActiveAccount(account);
    }
  }

  try {
    const silent = await pca.acquireTokenSilent({ scopes, account: pca.getActiveAccount() || account || undefined });
    if (silent?.accessToken) return silent.accessToken;
  } catch (_) {
    // Fallback to interactive popup below.
  }

  const popup = await pca.acquireTokenPopup({
    scopes,
    account: pca.getActiveAccount() || account || undefined,
    prompt: 'select_account'
  });

  if (!popup?.accessToken) {
    throw new Error('Entra access token acquisition failed.');
  }
  return popup.accessToken;
}

function hasAdminAccess() {
  const role = getStoredAuthRole();
  const permissions = getStoredAuthPermissions();
  return role === 'admin' || permissions.includes('user.manage');
}

function getInputValue(ids, fallback = '') {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && String(el.value || '').trim()) {
      return String(el.value || '').trim();
    }
  }
  return fallback;
}

function setInputValue(ids, value) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });
}

function normalizeAuthProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (provider === 'entraid' || provider === 'azuread') return 'entra';
  return provider || 'local';
}

function getSelectedAuthProvider() {
  return normalizeAuthProvider(getInputValue(['headerAuthProviderInput', 'authProviderInput'], getStoredAuthProvider() || 'local'));
}

function setAuthProviderInInputs(provider) {
  const normalized = normalizeAuthProvider(provider);
  setInputValue(['headerAuthProviderInput', 'authProviderInput'], normalized);
  setStoredAuthProvider(normalized);
}

function setAuthDialogHint(text) {
  const el = document.getElementById('authProviderHint');
  if (el) el.textContent = String(text || '').trim();
}

function setEntraConfigBadge(state) {
  const badge = document.getElementById('entraConfigBadge');
  if (!badge) return;

  function ensureEntraBadgeSpinStyle() {
    const styleId = 'entra-badge-spin-style';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = '@keyframes entraBadgeSpin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}} .entra-badge-spin{animation:entraBadgeSpin 1s linear infinite;transform-origin:center;display:inline-block;}';
    document.head.appendChild(style);
  }

  ensureEntraBadgeSpinStyle();

  function badgeWithIcon(svgMarkup, labelText) {
    const safeLabel = String(labelText || '').trim();
    return `${svgMarkup}<span>${safeLabel}</span>`;
  }

  const iconBaseClass = 'me-1';
  const checkingIcon = `<svg class="${iconBaseClass} entra-badge-spin" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.65"></circle><path d="M6 3.3V6L7.9 7.2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
  const readyIcon = `<svg class="${iconBaseClass}" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.2"></circle><path d="M3.1 6.3L5.1 8.2L8.9 4.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
  const infoIcon = `<svg class="${iconBaseClass}" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.2"></circle><circle cx="6" cy="3.5" r="0.8" fill="currentColor"></circle><path d="M6 5.2V8.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"></path></svg>`;
  const errorIcon = `<svg class="${iconBaseClass}" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.2"></circle><path d="M4 4L8 8M8 4L4 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"></path></svg>`;

  const normalized = String(state || '').trim().toLowerCase();
  if (!normalized || normalized === 'hidden') {
    badge.style.display = 'none';
    badge.textContent = '';
    return;
  }

  badge.style.display = '';
  badge.className = 'badge';
  if (normalized === 'checking') {
    badge.classList.add('bg-warning', 'text-dark');
    badge.innerHTML = badgeWithIcon(checkingIcon, tr('entraStatusChecking'));
    return;
  }
  if (normalized === 'ready') {
    badge.classList.add('bg-success');
    badge.innerHTML = badgeWithIcon(readyIcon, tr('entraStatusReady'));
    return;
  }
  if (normalized === 'not-configured') {
    badge.classList.add('bg-secondary');
    badge.innerHTML = badgeWithIcon(infoIcon, tr('entraStatusNotConfigured'));
    return;
  }

  badge.classList.add('bg-danger');
  badge.innerHTML = badgeWithIcon(errorIcon, tr('entraStatusError'));
}

function setEntraProviderInfo(text, isError = false) {
  const el = document.getElementById('entraProviderInfo');
  if (!el) return;
  el.textContent = String(text || '').trim();
  el.style.color = isError ? '#ff6b6b' : 'var(--accent-grey)';
}

function updateAuthDialogProviderUi(providerInput) {
  const provider = normalizeAuthProvider(providerInput || getSelectedAuthProvider());

  const userCol = document.getElementById('authUserCol');
  const passwordCol = document.getElementById('authPasswordCol');
  const otpCol = document.getElementById('authOtpCol');
  const entraButton = document.getElementById('entraSignInBtn');
  const entraConfigButton = document.getElementById('entraConfigBtn');

  const showUser = provider !== 'ad-header';
  const showPassword = provider === 'local' || provider === 'matrix42' || provider === 'activedirectory';
  const showOtp = provider === 'local';
  const isEntra = provider === 'entra';

  if (userCol) userCol.style.display = showUser ? '' : 'none';
  if (passwordCol) passwordCol.style.display = showPassword ? '' : 'none';
  if (otpCol) otpCol.style.display = showOtp ? '' : 'none';
  if (entraButton) entraButton.style.display = isEntra ? '' : 'none';
  if (entraConfigButton) entraConfigButton.style.display = isEntra ? '' : 'none';

  if (isEntra) {
    setAuthDialogHint(tr('authHintEntra'));
    window.refreshEntraProviderInfo();
  } else if (provider === 'ad-header') {
    setAuthDialogHint(tr('authHintAdHeader'));
    setEntraConfigBadge('hidden');
    setEntraProviderInfo('');
  } else {
    setAuthDialogHint(tr('authHintCredentials'));
    setEntraConfigBadge('hidden');
    setEntraProviderInfo('');
  }
}

window.refreshEntraProviderInfo = async function() {
  const provider = getSelectedAuthProvider();
  if (provider !== 'entra') {
    setEntraConfigBadge('hidden');
    setEntraProviderInfo('');
    return;
  }

  setEntraConfigBadge('checking');
  setEntraProviderInfo(tr('entraCheckingConfig'));
  try {
    const cfg = await loadEntraConfig();
    const state = String(cfg?.state || '').trim().toLowerCase()
      || ((!cfg?.enabled || !cfg?.clientId) ? 'not-configured' : 'ready');

    if (state === 'not-configured') {
      setEntraConfigBadge('not-configured');
      setEntraProviderInfo(tr('entraNotConfigured'), true);
      return;
    }

    if (state !== 'ready') {
      setEntraConfigBadge('error');
      setEntraProviderInfo(tr('catalogLoadFailed'), true);
      return;
    }

    const scopeCount = Array.isArray(cfg.scopes) ? cfg.scopes.length : 0;
    const tenant = cfg.tenantId || 'common';
    const oboConfigured = cfg?.capabilities?.oboState
      ? String(cfg.capabilities.oboState).toLowerCase() === 'ready'
      : Boolean(cfg.oboConfigured);
    const oboState = oboConfigured ? tr('enabledLabel') : tr('disabledLabel');
    setEntraConfigBadge('ready');
    setEntraProviderInfo(`${tr('entraReadyPrefix')} ${tr('tenantLabelShort')}: ${tenant}. ${tr('scopesLabelShort')}: ${scopeCount}. ${tr('oboLabelShort')}: ${oboState}.`);
  } catch (err) {
    setEntraConfigBadge('error');
    setEntraProviderInfo(err?.message || tr('catalogLoadFailed'), true);
  }
};

window.loginWithEntraFromDialog = async function() {
  setAuthProviderInInputs('entra');
  updateAuthDialogProviderUi('entra');
  await window.loginApiSession();
};

function updateHeaderAuthUser() {
  const chip = document.getElementById('headerAuthUser');
  if (!chip) return;
  const user = (() => {
    try {
      return localStorage.getItem(API_AUTH_USER_STORAGE_KEY) || '';
    } catch (_) {
      return '';
    }
  })();
  const role = getStoredAuthRole();
  chip.textContent = user ? `${user}${role ? ` (${role})` : ''}` : tr('notLoggedIn');
}

function updateAuthAdminPanelVisibility() {
  const panel = document.getElementById('authAdminPanel');
  if (!panel) return;
  panel.style.display = hasAdminAccess() ? 'block' : 'none';
}

function syncAuthInputs() {
  const token = getApiToken();
  setInputValue(['apiTokenInput'], token);
  let user = '';
  try {
    user = localStorage.getItem(API_AUTH_USER_STORAGE_KEY) || '';
  } catch (_) {
    user = '';
  }
  setInputValue(['authUserInput', 'headerAuthUserInput'], user);

  const storedProvider = normalizeAuthProvider(getStoredAuthProvider() || 'local');
  setInputValue(['authProviderInput', 'headerAuthProviderInput'], storedProvider);
  updateAuthDialogProviderUi(storedProvider);
}

function getApiToken() {
  try {
    return localStorage.getItem(API_TOKEN_STORAGE_KEY) || DEFAULT_API_TOKEN;
  } catch (_) {
    return DEFAULT_API_TOKEN;
  }
}

function getRefreshToken() {
  try {
    return localStorage.getItem(API_REFRESH_TOKEN_STORAGE_KEY) || '';
  } catch (_) {
    return '';
  }
}

function setApiToken(token) {
  const nextToken = String(token || '').trim();
  if (!nextToken) return;
  try {
    localStorage.setItem(API_TOKEN_STORAGE_KEY, nextToken);
  } catch (_) {
    // Ignore storage failures and continue with runtime usage.
  }
}

function setRefreshToken(token) {
  const nextToken = String(token || '').trim();
  try {
    if (!nextToken) {
      localStorage.removeItem(API_REFRESH_TOKEN_STORAGE_KEY);
      return;
    }
    localStorage.setItem(API_REFRESH_TOKEN_STORAGE_KEY, nextToken);
  } catch (_) {
    // Ignore storage failures.
  }
}

function setAuthStatus(text) {
  const targets = ['authStatusLabel', 'headerAuthStatus'];
  targets.forEach((id) => {
    const label = document.getElementById(id);
    if (label) label.textContent = translateRuntimeText(text || '');
  });
  updateHeaderAuthUser();
  updateAuthAdminPanelVisibility();
}

function formatAuthApiErrorMessage(body, fallbackText) {
  const payload = body && typeof body === 'object' ? body : {};
  const message = String(payload.message || payload.error || fallbackText || 'Authentication request failed.').trim();
  const code = String(payload.code || '').trim();
  const retryable = payload.retryable === true;

  const parts = [message];
  if (code) parts.push(`[${code}]`);
  if (retryable) parts.push('(retryable)');
  return parts.join(' ').trim();
}

(function setupApiAuthFetchInterceptor() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const originalFetch = window.fetch.bind(window);

  window.fetch = function(input, init = {}) {
    let url = '';
    if (typeof input === 'string') {
      url = input;
    } else if (input && typeof input.url === 'string') {
      url = input.url;
    }

    const isApiRequest = url.startsWith('/api/');
    if (!isApiRequest) {
      return originalFetch(input, init);
    }

    const headers = new Headers(init.headers || {});
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${getApiToken()}`);
    }

    return originalFetch(input, { ...init, headers });
  };
})();

window.applyApiTokenFromInput = function() {
  const token = getInputValue(['apiTokenInput']);
  if (!token) {
    alert('Please provide an API token.');
    return;
  }
  setApiToken(token);
  setStoredAuthRole('');
  setStoredAuthPermissions([]);
  alert('API token applied.');
  setAuthStatus('Manual bearer token active.');
  syncAuthInputs();
};

window.loginApiSession = async function() {
  const provider = getSelectedAuthProvider();
  const username = getInputValue(['headerAuthUserInput', 'authUserInput']);
  const password = getInputValue(['headerAuthPasswordInput', 'authPasswordInput']);
  const oneTimeCode = getInputValue(['headerAuthOneTimeCodeInput', 'authOneTimeCodeInput']);
  const manualBearer = getInputValue(['apiTokenInput'], getApiToken());

  const payload = { provider };
  try {
    if (provider === 'entra') {
      const token = await acquireEntraAccessTokenInteractive(username || '');
      payload.accessToken = token;
      setInputValue(['apiTokenInput'], token);
    } else if (provider === 'entraid' || provider === 'azuread') {
      const token = await acquireEntraAccessTokenInteractive(username || '');
      payload.provider = 'entra';
      payload.accessToken = token;
      setInputValue(['apiTokenInput'], token);
    } else if (provider === 'local' && manualBearer && manualBearer !== DEFAULT_API_TOKEN) {
      // Keep user-entered manual token visible for testing, but local login uses username/password.
    }
    if (username) payload.username = username;
    if (password) payload.password = password;
    if (oneTimeCode) payload.oneTimeCode = oneTimeCode;

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(formatAuthApiErrorMessage(body, 'Login failed.'));
    }

    setApiToken(body.accessToken || '');
    setRefreshToken(body.refreshToken || '');
    setStoredAuthRole(body.role || '');
    setStoredAuthPermissions(body.permissions || []);
    setStoredAuthProvider(body.provider || payload.provider || provider || '');
    try {
      localStorage.setItem(API_AUTH_USER_STORAGE_KEY, body.user || username || '');
    } catch (_) {
      // Ignore storage failures.
    }
    setAuthStatus(`Logged in as ${body.user || username || 'user'} (${body.role || 'n/a'})`);
    syncAuthInputs();
    updateAuthAdminPanelVisibility();
    if (hasAdminAccess()) {
      await loadManagedUsers();
    }
    alert('Login successful.');
  } catch (err) {
    alert(err?.message || 'Login failed.');
  }
};

window.refreshApiSession = async function() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    alert('No refresh token available. Login first.');
    return;
  }

  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(formatAuthApiErrorMessage(body, 'Refresh failed.'));
    }
    setApiToken(body.accessToken || '');
    setRefreshToken(body.refreshToken || '');
    setStoredAuthRole(body.role || getStoredAuthRole());
    setStoredAuthPermissions(body.permissions || getStoredAuthPermissions());
    if (body.user) {
      try {
        localStorage.setItem(API_AUTH_USER_STORAGE_KEY, body.user);
      } catch (_) {
        // Ignore storage failures.
      }
    }
    setAuthStatus(`Session refreshed (${body.role || 'n/a'})`);
    syncAuthInputs();
    if (hasAdminAccess()) {
      await loadManagedUsers();
    }
    alert('Session refreshed.');
  } catch (err) {
    alert(err?.message || 'Refresh failed.');
  }
};

window.logoutApiSession = async function() {
  let logoutMessage = 'Logged out.';
  let logoutMessageIsWarning = false;
  try {
    const refreshToken = getRefreshToken();
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      logoutMessage = formatAuthApiErrorMessage(body, 'Logout request failed. Local cleanup was applied.');
      logoutMessageIsWarning = true;
    }
  } catch (err) {
    // Logout cleanup continues even if request fails.
    logoutMessage = err?.message || 'Logout request failed. Local cleanup was applied.';
    logoutMessageIsWarning = true;
  }
  setApiToken(DEFAULT_API_TOKEN);
  setRefreshToken('');
  setStoredAuthRole('');
  setStoredAuthPermissions([]);
  const authProvider = getStoredAuthProvider();
  setStoredAuthProvider('');
  try {
    localStorage.removeItem(API_AUTH_USER_STORAGE_KEY);
  } catch (_) {
    // Ignore storage failures.
  }

  if (authProvider === 'entra') {
    try {
      const msalBundle = await getMsalClient();
      const account = msalBundle?.pca?.getActiveAccount() || (msalBundle?.pca?.getAllAccounts?.()[0] || null);
      if (account) {
        await msalBundle.pca.logoutPopup({ account });
      }
    } catch (_) {
      // Ignore MSAL logout errors and keep local logout behavior.
    }
  }

  syncAuthInputs();
  setAuthStatus('Logged out.');
  const tbody = document.getElementById('managedUsersTableBody');
  if (tbody) tbody.innerHTML = '';
  if (logoutMessageIsWarning) {
    setAuthStatus(logoutMessage);
  }
  alert(logoutMessage);
};

function managedUserRowId(username) {
  return encodeURIComponent(String(username || '')).replace(/%/g, '_');
}

function renderManagedUsers(users) {
  const tbody = document.getElementById('managedUsersTableBody');
  if (!tbody) return;
  if (!Array.isArray(users) || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-muted">${tr('noManagedUsersFound')}</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map((u) => {
    const rowId = managedUserRowId(u.username);
    const perms = Array.isArray(u.permissions) ? u.permissions : [];
    const permsText = perms.join(', ');
    const options = knownPermissions.map((p) => `<option value="${p}">${p}</option>`).join('');
    return `
      <tr>
        <td><b>${u.username}</b></td>
        <td>
          <select class="form-select form-select-sm" onchange="updateManagedUserRole('${u.username}', this.value)">
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
          </select>
        </td>
        <td style="text-align:center;"><input type="checkbox" ${u.enabled ? 'checked' : ''} onchange="toggleManagedUserEnabled('${u.username}', this.checked)"></td>
        <td>${permsText || '-'}</td>
        <td>
          <input id="permInput_${rowId}" class="form-control form-control-sm" list="permList_${rowId}" placeholder="permission">
          <datalist id="permList_${rowId}">${options}</datalist>
          <div class="mt-1 d-flex gap-1">
            <button class="btn btn-outline-success btn-sm" onclick="grantManagedPermission('${u.username}')">Grant</button>
            <button class="btn btn-outline-warning btn-sm" onclick="revokeManagedPermission('${u.username}')">Revoke</button>
          </div>
        </td>
        <td><button class="btn btn-outline-danger btn-sm" onclick="deleteManagedUser('${u.username}')">Delete</button></td>
      </tr>
    `;
  }).join('');
}

window.loadManagedUsers = async function() {
  if (!hasAdminAccess()) return;
  const res = await fetch('/api/auth/users');
  const body = await res.json().catch(() => []);
  if (!res.ok) {
    throw new Error(body?.error || 'Loading managed users failed');
  }
  renderManagedUsers(body);
  applyLanguage();
};

window.createManagedUser = async function() {
  const username = getInputValue(['newManagedUserName']);
  const password = getInputValue(['newManagedUserPassword']);
  const role = getInputValue(['newManagedUserRole'], 'user');
  const permissionsRaw = getInputValue(['newManagedUserPermissions']);
  const enabled = document.getElementById('newManagedUserEnabled')?.checked !== false;

  if (!username || !password) {
    alert('Username and password are required.');
    return;
  }

  const payload = {
    username,
    password,
    role,
    enabled,
    permissions: toPermissionArray(permissionsRaw)
  };

  const res = await fetch('/api/auth/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(body?.error || 'Create user failed');
    return;
  }

  setInputValue(['newManagedUserName', 'newManagedUserPassword', 'newManagedUserPermissions'], '');
  const enabledInput = document.getElementById('newManagedUserEnabled');
  if (enabledInput) enabledInput.checked = true;
  await loadManagedUsers();
  alert('User created successfully.');
};

window.updateManagedUserRole = async function(username, role) {
  const res = await fetch(`/api/auth/users/${encodeURIComponent(username)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(body?.error || 'Updating role failed');
    await loadManagedUsers();
    return;
  }
  await loadManagedUsers();
};

window.toggleManagedUserEnabled = async function(username, enabled) {
  const res = await fetch(`/api/auth/users/${encodeURIComponent(username)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(body?.error || 'Updating user state failed');
    await loadManagedUsers();
    return;
  }
};

window.grantManagedPermission = async function(username) {
  const rowId = managedUserRowId(username);
  const permission = getInputValue([`permInput_${rowId}`]);
  if (!permission) {
    alert('Please select a permission to grant.');
    return;
  }
  const res = await fetch(`/api/auth/users/${encodeURIComponent(username)}/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permission })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(body?.error || 'Grant permission failed');
    return;
  }
  await loadManagedUsers();
};

window.revokeManagedPermission = async function(username) {
  const rowId = managedUserRowId(username);
  const permission = getInputValue([`permInput_${rowId}`]);
  if (!permission) {
    alert('Please select a permission to revoke.');
    return;
  }
  const res = await fetch(`/api/auth/users/${encodeURIComponent(username)}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permission })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(body?.error || 'Revoke permission failed');
    return;
  }
  await loadManagedUsers();
};

window.deleteManagedUser = async function(username) {
  const confirmed = window.confirm(`Delete user '${username}'?`);
  if (!confirmed) return;
  const res = await fetch(`/api/auth/users/${encodeURIComponent(username)}`, {
    method: 'DELETE'
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(body?.error || 'Delete user failed');
    return;
  }
  await loadManagedUsers();
};

window.openAuthDialog = async function() {
  authModal = document.getElementById('authModal');
  if (!authModal) return;
  syncAuthInputs();
  updateAuthDialogProviderUi(getSelectedAuthProvider());
  authModal.style.display = 'block';
  authModal.classList.add('show');
  authModal.setAttribute('aria-modal', 'true');
  authModal.removeAttribute('aria-hidden');
  document.body.classList.add('auth-modal-open');
  document.body.style.overflow = 'hidden';

  if (hasAdminAccess()) {
    try {
      await loadManagedUsers();
    } catch (err) {
      setAuthStatus(err?.message || 'Loading admin data failed.');
    }
  }
};

window.closeAuthDialog = function() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('auth-modal-open');
  document.body.style.overflow = '';
};

function nowLabel() {
  return new Date().toLocaleString();
}

async function parseApiErrorMessage(res, fallbackText) {
  const statusHints = {
    400: 'The request data is invalid.',
    401: 'Authentication is required.',
    403: 'Access is denied.',
    404: 'The requested API endpoint was not found.',
    500: 'The server failed while processing the request.',
    503: 'The backend service is temporarily unavailable.'
  };

  let detail = '';
  try {
    const json = await res.clone().json();
    detail = json.error || json.message || '';
  } catch (_) {
    try {
      detail = (await res.clone().text()) || '';
    } catch (_) {
      detail = '';
    }
  }

  const hint = statusHints[res.status] || `HTTP ${res.status}`;
  const compactDetail = String(detail || '').replace(/\s+/g, ' ').trim();
  return `${fallbackText} ${hint}${compactDetail ? ` Details: ${compactDetail}` : ''}`.trim();
}

function parseNetworkErrorMessage(err, fallbackText) {
  if (err && err.name === 'AbortError') {
    return `${fallbackText} Request timed out.`;
  }
  return `${fallbackText} Network error or backend unavailable.`;
}

async function fetchJsonWithFriendlyErrors(url, fallbackText, options = {}) {
  try {
    const res = await fetch(url, options);
    let body = {};
    try {
      body = await res.json();
    } catch (_) {
      body = {};
    }
    if (!res.ok) {
      const message = await parseApiErrorMessage(res, fallbackText);
      throw new Error(message);
    }
    return body;
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error(parseNetworkErrorMessage(err, fallbackText));
  }
}

window.saveAssignments = async function() {
  if (!assignments.length) {
    alert('No assignments to save!');
    return;
  }
  let okCount = 0, failCount = 0;
  const failures = [];
  const ensuredLines = new Set();
  const ensuredStations = new Set();

  for (const a of assignments) {
    try {
      const lineId = String(a.lineId || '').trim();
      const stationId = String(a.stationId || '').trim();

      if (!lineId || !stationId) {
        throw new Error('Assignment is missing lineId or stationId.');
      }

      if (!ensuredLines.has(lineId)) {
        const line = lines.find((l) => String(l.id || '').trim() === lineId) || { id: lineId, description: lineId };
        const lineDescription = String(line.description || '').trim() || lineId;
        const lineShapeType = normalizeLineShapeType(line.shapeType);
        await fetchJsonWithFriendlyErrors('/api/line', 'Saving line for assignment failed.', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: lineId, description: lineDescription, shapeType: lineShapeType })
        });
        ensuredLines.add(lineId);
      }

      if (!ensuredStations.has(stationId)) {
        const station = stations.find((s) => String(s.id || '').trim() === stationId) || {
          id: stationId,
          description: stationId,
          bottleneck: false,
          lastStation: false,
          cycleTime: null
        };
        const stationDescription = String(station.description || '').trim() || stationId;
        await fetchJsonWithFriendlyErrors('/api/station', 'Saving station for assignment failed.', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: stationId,
            description: stationDescription,
            bottleneck: station.bottleneck === true,
            lastStation: station.lastStation === true,
            cycleTime: station.cycleTime != null ? station.cycleTime : null
          })
        });
        ensuredStations.add(stationId);
      }

      await fetchJsonWithFriendlyErrors('/api/point', 'Saving assignment failed.', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ measurement: 'shift_assignment', fields: { lineId, stationId } })
      });
      okCount++;
    } catch (err) {
      failCount++;
      failures.push(`${String(a.lineId || '').trim() || 'n/a'} -> ${String(a.stationId || '').trim() || 'n/a'}: ${err && err.message ? err.message : 'Unknown error'}`);
    }
  }

  const summary = `Assignments saved: ${okCount} successful${failCount ? ', ' + failCount + ' failed' : ''}`;
  if (!failCount) {
    alert(summary);
    return;
  }

  const preview = failures.slice(0, 5).join('\n');
  const suffix = failures.length > 5 ? `\n...and ${failures.length - 5} more` : '';
  alert(`${summary}\n\nDetails:\n${preview}${suffix}`);
};
// --- Write master data and assignments to InfluxDB ---
window.writeAllMasterdataToInflux = async function() {
  // Stations
  for (const s of stations) {
    await sendPointToApi('station', {
      id: s.id,
      description: s.description,
      bottleneck: s.bottleneck === true,
      lastStation: s.lastStation === true,
      cycleTime: s.cycleTime != null ? Number(s.cycleTime) : null
    });
  }
  // Lines
  for (const l of lines) {
    await sendPointToApi('line', { id: l.id, description: l.description, shapeType: normalizeLineShapeType(l.shapeType) });
  }
  // Shifts
  if (typeof shiftSchedules !== 'undefined') {
    for (const sh of shiftSchedules) {
      await sendPointToApi('shift', {
        id: sh.id,
        name: sh.name,
        start: sh.start,
        end: sh.end,
        lineId: sh.lineId,
        stationId: sh.stationId
      });
    }
  }
  // Assignments
  for (const a of assignments) {
    await sendPointToApi('shift_assignment', { lineId: a.lineId, stationId: a.stationId });
  }
  alert('All master data and assignments were sent to InfluxDB!');
};
// --- Assign Shift Modell to Station/Line ---

window.assignShiftSchedule = async function() {
  const modellName = document.getElementById('assignShiftSelect').value;
  const targetType = document.getElementById('assignTargetType').value;
  const targetId = document.getElementById('assignTargetId').value;
  if (!modellName || !targetType || !targetId) {
    alert('Please select shift modell, target type, and target.');
    return;
  }

  // Find the selected Shift Modell (weekPlanSet)
  const modell = (Array.isArray(weekPlanSets) ? weekPlanSets : []).find(m => m && String(m.name || '') === modellName);
  if (!modell || !Array.isArray(modell.entries) || modell.entries.length === 0) {
    alert('Selected Shift Modell is empty or not found.');
    return;
  }

  try {
    if (targetType === 'line') {
      const line = (Array.isArray(lines) ? lines : []).find((l) => String(l.id || '').trim() === targetId) || { id: targetId, description: targetId };
      await fetchJsonWithFriendlyErrors('/api/line', 'Ensuring target line failed.', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetId,
          description: String(line.description || targetId).trim() || targetId,
          shapeType: normalizeLineShapeType(line.shapeType)
        })
      });
    } else if (targetType === 'station') {
      const station = (Array.isArray(stations) ? stations : []).find((s) => String(s.id || '').trim() === targetId) || {
        id: targetId,
        description: targetId,
        bottleneck: false,
        lastStation: false,
        cycleTime: null
      };
      await fetchJsonWithFriendlyErrors('/api/station', 'Ensuring target station failed.', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetId,
          description: String(station.description || targetId).trim() || targetId,
          bottleneck: station.bottleneck === true,
          lastStation: station.lastStation === true,
          cycleTime: station.cycleTime != null ? Number(station.cycleTime) : null
        })
      });
    }
  } catch (err) {
    alert(err?.message || 'Preparing assignment target failed.');
    return;
  }

  // For each entry in the modell, create a shift record if needed, then assign
  let okCount = 0, failCount = 0;
  const failures = [];
  for (const entry of modell.entries) {
    // Compose a unique shift ID based on modell name and day/shift
    const shiftId = `${modellName}_${entry.day}_${entry.shift}`.replace(/\s+/g, '_');
    try {
      // Upsert shift record
      await fetchJsonWithFriendlyErrors('/api/shift', 'Creating shift for modell failed.', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: shiftId,
          name: entry.shift,
          start: entry.start,
          end: entry.end,
          lineId: targetType === 'line' ? targetId : undefined,
          stationId: targetType === 'station' ? targetId : undefined
        })
      });
      // Assign shift
      await fetchJsonWithFriendlyErrors('/api/assign-shift', 'Assigning shift failed.', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId, targetType, targetId })
      });
      okCount++;
    } catch (err) {
      failCount++;
      failures.push(`${entry.day || '?'} ${entry.shift || '?'}: ${err?.message || 'Unknown error'}`);
    }
  }
  const summary = `Shift modell assigned: ${okCount} successful${failCount ? ', ' + failCount + ' failed' : ''}`;
  if (failCount > 0) {
    const preview = failures.slice(0, 5).join('\n');
    const suffix = failures.length > 5 ? `\n...and ${failures.length - 5} more` : '';
    alert(`${summary}\n\nDetails:\n${preview}${suffix}`);
  } else {
    alert(summary);
  }

  const targetLabel = targetType === 'station'
    ? (stations.find(s => s.id === targetId)?.description || targetId)
    : (lines.find(l => l.id === targetId)?.description || targetId);

  modell.entries.forEach((entry) => {
    const shiftId = `${modellName}_${entry.day}_${entry.shift}`.replace(/\s+/g, '_');
    const exists = shiftAssignmentRecords.some((r) =>
      r.shiftId === shiftId && r.targetType === targetType && r.targetId === targetId
    );
    if (!exists) {
      shiftAssignmentRecords.push({
        modellName,
        shiftId,
        day: entry.day || '',
        shift: entry.shift || '',
        start: entry.start || '',
        end: entry.end || '',
        duration: entry.duration || '',
        targetType,
        targetId,
        targetLabel
      });
    }
  });
  renderAssignedShiftSchedules();
};

function renderAssignedShiftSchedules() {
  const assignedDiv = document.getElementById('assignedShiftSchedules');
  if (!assignedDiv)
    return;

  const toHtmlAttr = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const shiftNameSuggestions = Array.from(new Set(
    (timeEvents || [])
      .map((te) => String(te?.description || '').trim())
      .filter(Boolean)
  ));

  const shiftNameSuggestionsHtml = shiftAssignmentsEditMode
    ? `
      <datalist id="shiftAssignmentShiftSuggestions">
        ${shiftNameSuggestions.map((name) => `<option value="${toHtmlAttr(name)}"></option>`).join('')}
      </datalist>
    `
    : '';

  if (!Array.isArray(shiftAssignmentRecords) || shiftAssignmentRecords.length === 0) {
    assignedDiv.innerHTML = `<div class="text-muted">${tr('noShiftAssignmentsYet')}</div>`;
    return;
  }

  assignedDiv.innerHTML = `
    ${shiftNameSuggestionsHtml}
    <div class="table-responsive">
      <table class="table table-striped table-bordered">
        <thead>
          <tr>
            <th>${tr('shiftModells')}</th>
            <th>${tr('weekdayLabel')}</th>
            <th>${tr('shiftName')}</th>
            <th>${tr('start')}</th>
            <th>${tr('end')}</th>
            <th>${tr('duration')}</th>
            <th>${tr('targetType')}</th>
            <th>${tr('targetIdLabel')}</th>
            <th>${tr('targetLabelText')}</th>
            <th>${tr('action')}</th>
          </tr>
        </thead>
        <tbody>
          ${shiftAssignmentRecords.map((r, idx) => `
            <tr>
              <td>${shiftAssignmentsEditMode ? `<input class="form-control form-control-sm" value="${r.modellName || ''}" onchange="updateShiftAssignmentField(${idx},'modellName',this.value)">` : (r.modellName || '')}</td>
              <td>${shiftAssignmentsEditMode ? `<input class="form-control form-control-sm" value="${r.day || ''}" onchange="updateShiftAssignmentField(${idx},'day',this.value)">` : (r.day || '')}</td>
              <td>${shiftAssignmentsEditMode ? `<input class="form-control form-control-sm" list="shiftAssignmentShiftSuggestions" value="${toHtmlAttr(r.shift || '')}" onchange="updateShiftAssignmentField(${idx},'shift',this.value)">` : (r.shift || '')}</td>
              <td>${shiftAssignmentsEditMode ? `<input class="form-control form-control-sm" value="${r.start || ''}" onchange="updateShiftAssignmentField(${idx},'start',this.value)">` : (r.start || '')}</td>
              <td>${shiftAssignmentsEditMode ? `<input class="form-control form-control-sm" value="${r.end || ''}" onchange="updateShiftAssignmentField(${idx},'end',this.value)">` : (r.end || '')}</td>
              <td>${shiftAssignmentsEditMode ? `<input class="form-control form-control-sm" value="${r.duration || ''}" onchange="updateShiftAssignmentField(${idx},'duration',this.value)">` : (r.duration || '')}</td>
              <td>${shiftAssignmentsEditMode ? `<select class="form-select form-select-sm" onchange="updateShiftAssignmentField(${idx},'targetType',this.value)"><option value="station" ${r.targetType === 'station' ? 'selected' : ''}>station</option><option value="line" ${r.targetType === 'line' ? 'selected' : ''}>line</option></select>` : (r.targetType || '')}</td>
              <td>${shiftAssignmentsEditMode ? `<input class="form-control form-control-sm" value="${r.targetId || ''}" onchange="updateShiftAssignmentField(${idx},'targetId',this.value)">` : (r.targetId || '')}</td>
              <td>${shiftAssignmentsEditMode ? `<input class="form-control form-control-sm" value="${r.targetLabel || ''}" onchange="updateShiftAssignmentField(${idx},'targetLabel',this.value)">` : (r.targetLabel || '')}</td>
              <td>${shiftAssignmentsEditMode ? `<button class="btn btn-danger btn-sm" onclick="deleteShiftAssignmentRecord(${idx})">${tr('deleteLabel')}</button>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

window.deleteShiftAssignmentRecord = function(idx) {
  if (idx < 0 || idx >= shiftAssignmentRecords.length)
    return;
  shiftAssignmentRecords.splice(idx, 1);
  renderAssignedShiftSchedules();
};

window.updateShiftAssignmentField = function(idx, field, value) {
  if (idx < 0 || idx >= shiftAssignmentRecords.length)
    return;
  shiftAssignmentRecords[idx][field] = value;
};

window.showShiftAssignments = function() {
  shiftAssignmentsEditMode = false;
  renderAssignedShiftSchedules();
};

window.editShiftAssignments = function() {
  shiftAssignmentsEditMode = true;
  renderAssignedShiftSchedules();
};

window.saveShiftAssignmentsEdit = function() {
  shiftAssignmentsEditMode = false;
  renderAssignedShiftSchedules();
};

window.resetShiftAssignments = function() {
  shiftAssignmentRecords = [];
  shiftAssignmentsEditMode = true;
  renderAssignedShiftSchedules();
};

// Populate shift modell and target selects on page load or data change
function populateAssignShiftScheduleUI() {
  const shiftSelect = document.getElementById('assignShiftSelect');
  const targetTypeSelect = document.getElementById('assignTargetType');
  const targetIdSelect = document.getElementById('assignTargetId');
  if (!shiftSelect || !targetTypeSelect || !targetIdSelect) return;
  // Populate saved Shift Modells from section 3.
  const savedShiftModells = Array.isArray(weekPlanSets)
    ? weekPlanSets.filter((m) => m && String(m.name || '').trim())
    : [];

  shiftSelect.innerHTML = `<option value="">${tr('selectShiftModell')}</option>` +
    savedShiftModells.map((m) => `<option value="${m.name}">${m.name}</option>`).join('');
  // Populate targets based on type
  function updateTargets() {
    const type = targetTypeSelect.value;
    let options = `<option value="">${tr('selectTarget')}</option>`;
    if (type === 'station') {
      options += stations.map(s => `<option value="${s.id}">${s.id} - ${s.description}</option>`).join('');
    } else if (type === 'line') {
      options += lines.map(l => `<option value="${l.id}">${l.id} - ${l.description}</option>`).join('');
    }
    targetIdSelect.innerHTML = options;
  }
  targetTypeSelect.onchange = updateTargets;
  updateTargets();
}

// Call this after loading shift modells, stations, or lines
setTimeout(populateAssignShiftScheduleUI, 500);

const API_CATALOG = [
  {
    id: 'get-station-setting',
    label: 'GET /api/stationSetting',
    method: 'GET',
    path: '/api/stationSetting',
    description: 'Get station settings (bottleneck and cycle time). Minimum input: none.',
    inputs: []
  },
  {
    id: 'get-lines',
    label: 'GET /api/lines',
    method: 'GET',
    path: '/api/lines',
    description: 'Get all lines. Minimum input: none.',
    inputs: []
  },
  {
    id: 'get-stations',
    label: 'GET /api/stations',
    method: 'GET',
    path: '/api/stations',
    description: 'Get all stations. Minimum input: none.',
    inputs: []
  },
  {
    id: 'get-shifts',
    label: 'GET /api/shifts',
    method: 'GET',
    path: '/api/shifts',
    description: 'Get all shifts. Minimum input: none.',
    inputs: []
  },
  {
    id: 'get-sql-integrity',
    label: 'GET /api/sql-integrity',
    method: 'GET',
    path: '/api/sql-integrity',
    description: 'Get SQL integrity report. Minimum input: none.',
    inputs: [],
    outputKeys: ['stationsWithoutLine', 'assignmentsWithoutTarget', 'inconsistentTargetType', 'error']
  },
  {
    id: 'post-sql-integrity-repair',
    label: 'POST /api/sql-integrity-repair',
    method: 'POST',
    path: '/api/sql-integrity-repair',
    description: 'Run SQL integrity repair. Minimum input: none.',
    inputs: [],
    outputKeys: ['status', 'report', 'error']
  },
  {
    id: 'post-station',
    label: 'POST /api/station',
    method: 'POST',
    path: '/api/station',
    description: 'Create or update station. Minimum input: id, description.',
    inputs: [
      { name: 'id', label: 'Station ID', location: 'body', required: true, recommendationKey: 'stationId' },
      { name: 'description', label: 'Description', location: 'body', required: true },
      { name: 'bottleneck', label: 'Bottleneck', location: 'body', type: 'select', options: ['false', 'true'] },
      { name: 'lastStation', label: 'Last Station', location: 'body', type: 'select', options: ['false', 'true'] },
      { name: 'cycleTime', label: 'Cycle Time', location: 'body', type: 'number' }
    ]
  },
  {
    id: 'post-line',
    label: 'POST /api/line',
    method: 'POST',
    path: '/api/line',
    description: 'Create or update line. Minimum input: id, description.',
    inputs: [
      { name: 'id', label: 'Line ID', location: 'body', required: true, recommendationKey: 'lineId' },
      { name: 'description', label: 'Description', location: 'body', required: true },
      { name: 'shapeType', label: 'Shape Type', location: 'body', type: 'select', options: ['I-shape', 'L-shape', 'U-shape', 'O-shape', 'S-shape', 'T-shape', 'Cell-shape'] }
    ]
  },
  {
    id: 'post-shift',
    label: 'POST /api/shift',
    method: 'POST',
    path: '/api/shift',
    description: 'Create or update shift. Minimum input: id, name, start, end.',
    inputs: [
      { name: 'id', label: 'Shift ID', location: 'body', required: true, recommendationKey: 'shiftId' },
      { name: 'name', label: 'Shift Name', location: 'body', required: true },
      { name: 'start', label: 'Start (HH:mm)', location: 'body', required: true },
      { name: 'end', label: 'End (HH:mm)', location: 'body', required: true },
      { name: 'lineId', label: 'Line ID', location: 'body', recommendationKey: 'lineId' },
      { name: 'stationId', label: 'Station ID', location: 'body', recommendationKey: 'stationId' }
    ]
  },
  {
    id: 'post-assign-shift',
    label: 'POST /api/assign-shift',
    method: 'POST',
    path: '/api/assign-shift',
    description: 'Assign a shift to line or station. Minimum input: shiftId, targetType, targetId.',
    inputs: [
      { name: 'shiftId', label: 'Shift ID', location: 'body', required: true, recommendationKey: 'shiftId' },
      { name: 'targetType', label: 'Target Type', location: 'body', required: true, type: 'select', options: ['station', 'line'] },
      { name: 'targetId', label: 'Target ID', location: 'body', required: true, recommendationKey: 'targetId' }
    ]
  },
  {
    id: 'post-point',
    label: 'POST /api/point',
    method: 'POST',
    path: '/api/point',
    description: 'Generic measurement write endpoint. Minimum input: measurement, fields.',
    inputs: [
      { name: 'measurement', label: 'Measurement', location: 'body', required: true, type: 'select', options: ['station', 'line', 'shift', 'shift_assignment', 'test_measurement'] },
      { name: 'fields', label: 'Fields (JSON)', location: 'body', required: true, type: 'json' },
      { name: 'tags', label: 'Tags (JSON)', location: 'body', type: 'json' }
    ]
  },
  {
    id: 'patch-station',
    label: 'PATCH /api/station/:id',
    method: 'PATCH',
    path: '/api/station/:id',
    descriptionKey: 'apiDescPatchStation',
    description: 'Change station fields (description, bottleneck, cycleTime). Minimum input: id + at least one field.',
    minimumInputKeys: ['id', 'description|bottleneck|cycleTime'],
    keyInputKeys: ['id', 'description', 'bottleneck', 'cycleTime'],
    inputs: [
      { name: 'id', labelKey: 'stationId', location: 'path', required: true, recommendationKey: 'stationId' },
      { name: 'description', labelKey: 'description', location: 'body' },
      { name: 'bottleneck', labelKey: 'bottleneck', location: 'body', type: 'select', options: ['false', 'true'] },
      { name: 'cycleTime', labelKey: 'cycleTime', location: 'body', type: 'number' }
    ],
    outputKeys: ['status', 'station', 'error'],
    outputs: ['status', 'station', 'error']
  },
  {
    id: 'delete-station',
    label: 'DELETE /api/station/:id',
    method: 'DELETE',
    path: '/api/station/:id',
    descriptionKey: 'apiDescDeleteStation',
    description: 'Delete station by id. Minimum input: id.',
    minimumInputKeys: ['id'],
    keyInputKeys: ['id'],
    inputs: [
      { name: 'id', labelKey: 'stationId', location: 'path', required: true, recommendationKey: 'stationId' }
    ],
    outputKeys: ['status', 'deletedId', 'error'],
    outputs: ['status', 'deletedId', 'error']
  },
  {
    id: 'patch-line',
    label: 'PATCH /api/line/:id',
    method: 'PATCH',
    path: '/api/line/:id',
    descriptionKey: 'apiDescPatchLine',
    description: 'Change line description. Minimum input: id, description.',
    minimumInputKeys: ['id', 'description'],
    keyInputKeys: ['id', 'description'],
    inputs: [
      { name: 'id', labelKey: 'lineId', location: 'path', required: true, recommendationKey: 'lineId' },
      { name: 'description', labelKey: 'description', location: 'body', required: true }
    ],
    outputKeys: ['status', 'line', 'error'],
    outputs: ['status', 'line', 'error']
  },
  {
    id: 'delete-line',
    label: 'DELETE /api/line/:id',
    method: 'DELETE',
    path: '/api/line/:id',
    descriptionKey: 'apiDescDeleteLine',
    description: 'Delete line by id. Minimum input: id.',
    minimumInputKeys: ['id'],
    keyInputKeys: ['id'],
    inputs: [
      { name: 'id', labelKey: 'lineId', location: 'path', required: true, recommendationKey: 'lineId' }
    ],
    outputKeys: ['status', 'deletedId', 'error'],
    outputs: ['status', 'deletedId', 'error']
  },
  {
    id: 'patch-shift',
    label: 'PATCH /api/shift/:id',
    method: 'PATCH',
    path: '/api/shift/:id',
    descriptionKey: 'apiDescPatchShift',
    description: 'Change shift fields. Minimum input: id + one or more fields.',
    minimumInputKeys: ['id', 'name|start|end|lineId|stationId'],
    keyInputKeys: ['id', 'name', 'start', 'end'],
    inputs: [
      { name: 'id', labelKey: 'shiftId', location: 'path', required: true, recommendationKey: 'shiftId' },
      { name: 'name', labelKey: 'shiftName', location: 'body' },
      { name: 'start', labelKey: 'start', location: 'body' },
      { name: 'end', labelKey: 'end', location: 'body' },
      { name: 'lineId', labelKey: 'lineId', location: 'body', recommendationKey: 'lineId' },
      { name: 'stationId', labelKey: 'stationId', location: 'body', recommendationKey: 'stationId' }
    ],
    outputKeys: ['status', 'shift', 'error'],
    outputs: ['status', 'shift', 'error']
  },
  {
    id: 'delete-shift',
    label: 'DELETE /api/shift/:id',
    method: 'DELETE',
    path: '/api/shift/:id',
    descriptionKey: 'apiDescDeleteShift',
    description: 'Delete shift by id. Minimum input: id.',
    minimumInputKeys: ['id'],
    keyInputKeys: ['id'],
    inputs: [
      { name: 'id', labelKey: 'shiftId', location: 'path', required: true, recommendationKey: 'shiftId' }
    ],
    outputKeys: ['status', 'deletedId', 'error'],
    outputs: ['status', 'deletedId', 'error']
  },
  {
    id: 'get-assign-shift',
    label: 'GET /api/assign-shift',
    method: 'GET',
    path: '/api/assign-shift',
    descriptionKey: 'apiDescGetAssignShift',
    description: 'Get all shift assignments. Minimum input: none.',
    inputs: []
  },
  {
    id: 'patch-assign-shift',
    label: 'PATCH /api/assign-shift/:id',
    method: 'PATCH',
    path: '/api/assign-shift/:id',
    descriptionKey: 'apiDescPatchAssignShift',
    description: 'Change one shift assignment. Minimum input: id + targetType + targetId.',
    minimumInputKeys: ['id', 'targetType', 'targetId'],
    keyInputKeys: ['id', 'targetType', 'targetId', 'shiftId'],
    inputs: [
      { name: 'id', labelKey: 'assignmentId', location: 'path', required: true },
      { name: 'shiftId', labelKey: 'shiftId', location: 'body', recommendationKey: 'shiftId' },
      { name: 'targetType', labelKey: 'targetType', location: 'body', required: true, type: 'select', options: ['station', 'line'] },
      { name: 'targetId', labelKey: 'targetIdLabel', location: 'body', required: true, recommendationKey: 'targetId' },
      { name: 'lineId', labelKey: 'lineId', location: 'body', recommendationKey: 'lineId' },
      { name: 'stationId', labelKey: 'stationId', location: 'body', recommendationKey: 'stationId' }
    ],
    outputKeys: ['status', 'assignment', 'error'],
    outputs: ['status', 'assignment', 'error']
  },
  {
    id: 'delete-assign-shift',
    label: 'DELETE /api/assign-shift/:id',
    method: 'DELETE',
    path: '/api/assign-shift/:id',
    descriptionKey: 'apiDescDeleteAssignShift',
    description: 'Delete one shift assignment. Minimum input: id.',
    minimumInputKeys: ['id'],
    keyInputKeys: ['id'],
    inputs: [
      { name: 'id', labelKey: 'assignmentId', location: 'path', required: true }
    ],
    outputKeys: ['status', 'deletedId', 'error'],
    outputs: ['status', 'deletedId', 'error']
  },
  {
    id: 'delete-masterdata-template',
    label: 'DELETE /api/masterdata-templates/:id',
    method: 'DELETE',
    path: '/api/masterdata-templates/:id',
    descriptionKey: 'apiDescDeleteTemplate',
    description: 'Delete one masterdata template by id. Minimum input: id.',
    minimumInputKeys: ['id'],
    keyInputKeys: ['id'],
    inputs: [
      { name: 'id', labelKey: 'templateId', location: 'path', required: true, recommendationKey: 'templateId' }
    ],
    outputKeys: ['status', 'deletedId', 'error'],
    outputs: ['status', 'deletedId', 'error']
  },
  {
    id: 'contract-get-stations-by-line',
    label: 'GET /api/lines/:lineId/stations',
    method: 'GET',
    path: '/api/lines/:lineId/stations',
    description: 'Contract endpoint: stations for line. Minimum input: lineId.',
    inputs: [
      { name: 'lineId', label: 'Line ID', location: 'path', required: true, recommendationKey: 'lineId' }
    ]
  },
  {
    id: 'contract-get-time-events',
    label: 'GET /api/time-events',
    method: 'GET',
    path: '/api/time-events',
    description: 'Contract endpoint: all time events. Minimum input: none.',
    inputs: []
  },
  {
    id: 'contract-get-shift-modells',
    label: 'GET /api/shift-modells',
    method: 'GET',
    path: '/api/shift-modells',
    description: 'Contract endpoint: all shift modells. Minimum input: none.',
    inputs: []
  },
  {
    id: 'contract-get-bottlenecks',
    label: 'GET /api/lines/:lineId/bottlenecks',
    method: 'GET',
    path: '/api/lines/:lineId/bottlenecks',
    description: 'Contract endpoint: bottlenecks per line. Minimum input: lineId.',
    inputs: [
      { name: 'lineId', label: 'Line ID', location: 'path', required: true, recommendationKey: 'lineId' }
    ]
  },
  {
    id: 'contract-get-bottleneck-cycle-target',
    label: 'GET /api/lines/:lineId/bottleneck-cycle-time',
    method: 'GET',
    path: '/api/lines/:lineId/bottleneck-cycle-time',
    description: 'Contract endpoint: bottleneck cycle time target for line. Minimum input: lineId.',
    inputs: [
      { name: 'lineId', label: 'Line ID', location: 'path', required: true, recommendationKey: 'lineId' }
    ]
  },
  {
    id: 'contract-get-cycle-time',
    label: 'GET /api/stations/:stationId/cycle-time',
    method: 'GET',
    path: '/api/stations/:stationId/cycle-time',
    description: 'Contract endpoint: cycle time for one station. Minimum input: stationId.',
    inputs: [
      { name: 'stationId', label: 'Station ID', location: 'path', required: true, recommendationKey: 'stationId' }
    ]
  },
  {
    id: 'contract-get-shift-schedule',
    label: 'GET /api/shift-schedule?stationId=... or ?lineId=...',
    method: 'GET',
    path: '/api/shift-schedule',
    description: 'Contract endpoint: shift schedule by selected target type and target id, using server local time. Minimum input: targetType and targetId.',
    inputs: [
      { name: 'targetType', label: 'Target Type', location: 'virtual', required: true, type: 'select', options: ['station', 'line'] },
      { name: 'targetId', label: 'Target ID', location: 'query', required: true, recommendationKey: 'targetId' }
    ]
  },
  {
    id: 'contract-get-shift-data',
    label: 'GET /api/shift-data?lineId=... or local active shift',
    method: 'GET',
    path: '/api/shift-data',
    description: 'Contract endpoint: shift data by lineId (all shifts) or local active shift when lineId is omitted.',
    inputs: [
      { name: 'lineId', label: 'Line ID', location: 'query', required: false, recommendationKey: 'lineId' }
    ]
  },
  {
    id: 'mes-line-summary',
    label: 'GET /api/lines/:lineId/mes-summary',
    method: 'GET',
    path: '/api/lines/:lineId/mes-summary',
    description: 'MES summary endpoint: returns station count, shift count, active shift, and bottleneck KPI for one line. Minimum input: lineId.',
    minimumInputKeys: ['lineId'],
    keyInputKeys: ['lineId'],
    outputKeys: [
      'lineId',
      'lineDescription',
      'stationCount',
      'shiftCount',
      'activeShiftId',
      'activeShiftName',
      'bottleneckStationId',
      'bottleneckStationDescription',
      'bottleneckCycleTime',
      'error'
    ],
    inputs: [
      { name: 'lineId', label: 'Line ID', location: 'path', required: true, recommendationKey: 'lineId' }
    ]
  },
  {
    id: 'uns-shift-schedule',
    label: 'GET /api/fld/shift-schedule-v1?stationId=... or ?lineId=...',
    method: 'GET',
    path: '/api/fld/shift-schedule-v1',
    description: 'FLD catalog endpoint: envelope with required Version, required Timestamp and ShiftSchedule object.',
    minimumInputKeys: ['stationId|lineId'],
    keyInputKeys: ['stationId', 'lineId'],
    outputKeys: ['Version', 'Timestamp', 'ShiftSchedule'],
    requiredOutputKeys: ['Version', 'Timestamp', 'ShiftSchedule'],
    inputs: [
      { name: 'stationId', label: 'Station ID', location: 'query', required: false, recommendationKey: 'stationId' },
      { name: 'lineId', label: 'Line ID', location: 'query', required: false, recommendationKey: 'lineId' },
      { name: 'fromLocal', label: 'From (local, -1 = default)', location: 'query', required: false },
      { name: 'toLocal', label: 'To (local, -1 = now)', location: 'query', required: false }
    ]
  },
  {
    id: 'uns-break-schedule',
    label: 'GET /api/fld/break-schedule-v1?stationId=... or ?lineId=...',
    method: 'GET',
    path: '/api/fld/break-schedule-v1',
    description: 'FLD catalog endpoint: envelope with required Version, required Timestamp and BreakSchedule array.',
    minimumInputKeys: ['stationId|lineId'],
    keyInputKeys: ['stationId', 'lineId'],
    outputKeys: ['Version', 'Timestamp', 'BreakSchedule'],
    requiredOutputKeys: ['Version', 'Timestamp', 'BreakSchedule'],
    inputs: [
      { name: 'stationId', label: 'Station ID', location: 'query', required: false, recommendationKey: 'stationId' },
      { name: 'lineId', label: 'Line ID', location: 'query', required: false, recommendationKey: 'lineId' },
      { name: 'fromLocal', label: 'From (local, -1 = default)', location: 'query', required: false },
      { name: 'toLocal', label: 'To (local, -1 = now)', location: 'query', required: false }
    ]
  },
  {
    id: 'uns-cycle-time',
    label: 'GET /api/fld/cycle-time-v1?lineId=...',
    method: 'GET',
    path: '/api/fld/cycle-time-v1',
    description: 'FLD catalog endpoint: envelope with required Version, required Timestamp and CycleTime object.',
    minimumInputKeys: ['lineId'],
    keyInputKeys: ['lineId'],
    outputKeys: ['Version', 'Timestamp', 'CycleTime'],
    requiredOutputKeys: ['Version', 'Timestamp', 'CycleTime'],
    inputs: [
      { name: 'lineId', label: 'Line ID', location: 'query', required: true, recommendationKey: 'lineId' }
    ]
  },
  {
    id: 'fld-metadata-line',
    label: 'GET /api/fld/metadata-line-v1?lineId=...',
    method: 'GET',
    path: '/api/fld/metadata-line-v1',
    description: 'FLD catalog endpoint: required Version, required Timestamp and required MetadataLine object derived from station-to-line assignments plus explicit bottleneck, last-station and cycle-time information.',
    minimumInputKeys: ['lineId'],
    keyInputKeys: ['lineId'],
    outputKeys: ['Version', 'Timestamp', 'MetadataLine', 'MetadataLine.BottleneckStationIds', 'MetadataLine.BottleneckCycleTimes', 'MetadataLine.LastStationId', 'MetadataLine.CycleTime'],
    requiredOutputKeys: ['Version', 'Timestamp', 'MetadataLine'],
    inputs: [
      { name: 'lineId', label: 'Line ID', location: 'query', required: true, recommendationKey: 'lineId' }
    ]
  }
];

const API_CATALOG_METHOD_ORDER = {
  GET: 0,
  POST: 1,
  DELETE: 2
};

API_CATALOG.sort((a, b) => {
  const sectionA = getApiCatalogSection(a);
  const sectionB = getApiCatalogSection(b);
  const sectionRankA = sectionA === 'system-api' ? 0 : 1;
  const sectionRankB = sectionB === 'system-api' ? 0 : 1;
  if (sectionRankA !== sectionRankB) {
    return sectionRankA - sectionRankB;
  }

  const methodA = String(a?.method || '').toUpperCase();
  const methodB = String(b?.method || '').toUpperCase();
  const rankA = Object.prototype.hasOwnProperty.call(API_CATALOG_METHOD_ORDER, methodA)
    ? API_CATALOG_METHOD_ORDER[methodA]
    : 3;
  const rankB = Object.prototype.hasOwnProperty.call(API_CATALOG_METHOD_ORDER, methodB)
    ? API_CATALOG_METHOD_ORDER[methodB]
    : 3;

  if (rankA !== rankB)
    return rankA - rankB;

  const pathA = String(a?.path || '');
  const pathB = String(b?.path || '');
  const byPath = pathA.localeCompare(pathB);
  if (byPath !== 0)
    return byPath;

  return String(a?.label || '').localeCompare(String(b?.label || ''));
});

const apiCatalogFieldSelection = new Map();
const apiCatalogOutputHints = new Map();

function apiCatalogRecommendations(key) {
  if (key === 'lineId') {
    return (Array.isArray(lines) ? lines : []).map((l) => String(l.id || '')).filter(Boolean);
  }
  if (key === 'stationId') {
    return (Array.isArray(stations) ? stations : []).map((s) => String(s.id || '')).filter(Boolean);
  }
  if (key === 'shiftId') {
    const fromSchedules = (Array.isArray(shiftSchedules) ? shiftSchedules : []).map((s) => String(s.id || '')).filter(Boolean);
    return [...new Set(fromSchedules)];
  }
  if (key === 'targetId') {
    const stationIds = (Array.isArray(stations) ? stations : []).map((s) => String(s.id || '')).filter(Boolean);
    const lineIds = (Array.isArray(lines) ? lines : []).map((l) => String(l.id || '')).filter(Boolean);
    return [...new Set([...stationIds, ...lineIds])];
  }
  if (key === 'templateId') {
    const select = document.getElementById('masterdataTemplateCatalog');
    if (!select) return [];
    return Array.from(select.options || []).map((opt) => String(opt.value || '').trim()).filter(Boolean);
  }
  return [];
}

function getApiCatalogInputOptions(entry) {
  return (entry.inputs || []).map((input) => ({
    name: input.name,
    label: input.labelKey ? tr(input.labelKey) : (input.label || input.name),
    required: input.required === true
  }));
}

function uniqueNonEmpty(values) {
  return [...new Set((values || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function getApiCatalogMinimumInputKeys(entry) {
  if (Array.isArray(entry.minimumInputKeys) && entry.minimumInputKeys.length) {
    return uniqueNonEmpty(entry.minimumInputKeys);
  }

  const inputs = Array.isArray(entry.inputs) ? entry.inputs : [];
  if (!inputs.length) {
    return [];
  }

  const required = inputs.filter((input) => input.required === true).map((input) => input.name);
  if (required.length) {
    return uniqueNonEmpty(required);
  }

  const pathOrQuery = inputs
    .filter((input) => input.location === 'path' || input.location === 'query')
    .map((input) => input.name);
  if (pathOrQuery.length) {
    return uniqueNonEmpty(pathOrQuery.slice(0, 2));
  }

  return uniqueNonEmpty(inputs.slice(0, 1).map((input) => input.name));
}

function getApiCatalogKeyInputKeys(entry) {
  if (Array.isArray(entry.keyInputKeys) && entry.keyInputKeys.length) {
    return uniqueNonEmpty(entry.keyInputKeys);
  }

  const inputs = Array.isArray(entry.inputs) ? entry.inputs : [];
  if (!inputs.length) {
    return [];
  }

  const required = inputs.filter((input) => input.required === true).map((input) => input.name);
  const usefulOptional = inputs
    .filter((input) => input.required !== true && (input.location === 'path' || input.location === 'query' || input.recommendationKey))
    .map((input) => input.name);
  const all = inputs.map((input) => input.name);
  return uniqueNonEmpty([...required, ...usefulOptional, ...all]).slice(0, 4);
}

function getApiCatalogKeyOutputKeys(entry) {
  const hinted = apiCatalogOutputHints.get(entry.id);
  const declared = Array.isArray(entry.outputKeys) && entry.outputKeys.length
    ? entry.outputKeys
    : (Array.isArray(entry.outputs) && entry.outputs.length ? entry.outputs : []);

  const primary = declared.length ? declared : (Array.isArray(hinted) ? hinted : []);
  if (primary.length) {
    return uniqueNonEmpty(primary).slice(0, 6);
  }

  const method = String(entry.method || '').toUpperCase();
  if (method === 'DELETE') {
    return ['status', 'deletedId', 'error'];
  }
  if (method === 'GET') {
    return ['status', 'error'];
  }
  return ['status', 'error'];
}

function formatApiCatalogRecommendationLine(title, keys) {
  if (!Array.isArray(keys) || !keys.length) {
    return `${title}: none`;
  }
  return `${title}: ${keys.join(', ')}`;
}

function getApiCatalogSection(entry) {
  const path = String(entry?.path || '').toLowerCase();
  if (path.startsWith('/api/fld/')) {
    return 'fld-usecase';
  }
  return 'system-api';
}

function getApiCatalogSectionLabel(section) {
  if (section === 'fld-usecase') {
    return 'FLD';
  }
  return 'System';
}

function getApiCatalogRequiredContractText(entry) {
  const requiredInputs = Array.isArray(entry.requiredInputKeys) && entry.requiredInputKeys.length
    ? entry.requiredInputKeys
    : [];
  const requiredOutputs = Array.isArray(entry.requiredOutputKeys) && entry.requiredOutputKeys.length
    ? entry.requiredOutputKeys
    : [];

  if (!requiredInputs.length && !requiredOutputs.length) {
    return '';
  }

  const parts = [];
  if (requiredInputs.length) {
    parts.push(formatApiCatalogRecommendationLine('Required input keys', requiredInputs));
  }
  if (requiredOutputs.length) {
    parts.push(formatApiCatalogRecommendationLine('Required output keys', requiredOutputs));
  }
  return parts.join(' | ');
}

function getApiCatalogEntryDescription(entry) {
  const rawDescription = entry.descriptionKey
    ? tr(entry.descriptionKey)
    : (entry.description || '');
  const baseDescription = rawDescription.replace(/\s*Minimum input:\s*.*$/i, '').trim();
  const section = getApiCatalogSection(entry);

  const minimumInputKeys = getApiCatalogMinimumInputKeys(entry);
  const keyInputKeys = getApiCatalogKeyInputKeys(entry);
  const requiredContractText = getApiCatalogRequiredContractText(entry);

  const recommendationParts = [
    `Catalog part: ${getApiCatalogSectionLabel(section)}`,
    formatApiCatalogRecommendationLine('Minimum input keys', minimumInputKeys)
  ];

  if (section === 'fld-usecase') {
    recommendationParts.push(formatApiCatalogRecommendationLine('Key input keys', keyInputKeys));
    recommendationParts.push(requiredContractText || formatApiCatalogRecommendationLine('Required output keys', getApiCatalogKeyOutputKeys(entry)));
  }

  const recommendationText = recommendationParts.filter(Boolean).join(' | ');

  if (!baseDescription) {
    return recommendationText;
  }

  return `${baseDescription} ${recommendationText}`;
}

function getApiCatalogOutputOptions(entry) {
  const hinted = apiCatalogOutputHints.get(entry.id);
  const base = Array.isArray(entry.outputKeys) && entry.outputKeys.length
    ? entry.outputKeys
    : (Array.isArray(entry.outputs) && entry.outputs.length
      ? entry.outputs
      : (Array.isArray(hinted) && hinted.length ? hinted : ['status', 'error']));
  return [...new Set(base.map((x) => String(x || '').trim()).filter(Boolean))];
}

function extractApiPayloadTopKeys(payload) {
  if (Array.isArray(payload)) {
    if (payload.length > 0 && payload[0] && typeof payload[0] === 'object' && !Array.isArray(payload[0])) {
      return Object.keys(payload[0]);
    }
    return ['value', 'Count'];
  }
  if (payload && typeof payload === 'object') {
    return Object.keys(payload);
  }
  return [];
}

function ensureApiCatalogFieldSelection(entry, inputOptions, outputOptions) {
  if (!apiCatalogFieldSelection.has(entry.id)) {
    apiCatalogFieldSelection.set(entry.id, {
      inputs: new Set(inputOptions.map((opt) => opt.name)),
      outputs: new Set(outputOptions)
    });
    return;
  }

  const state = apiCatalogFieldSelection.get(entry.id);
  inputOptions.forEach((opt) => {
    if (!state.inputs.has(opt.name)) {
      state.inputs.add(opt.name);
    }
  });
  outputOptions.forEach((key) => {
    if (!state.outputs.has(key)) {
      state.outputs.add(key);
    }
  });
}

function isApiCatalogInputSelected(entry, name) {
  const state = apiCatalogFieldSelection.get(entry.id);
  if (!state) return true;
  return state.inputs.has(name);
}

function getSelectedApiCatalogOutputKeys(entry) {
  const state = apiCatalogFieldSelection.get(entry.id);
  if (!state) return new Set(getApiCatalogOutputOptions(entry));
  return state.outputs;
}

function renderApiCatalogFieldSelectors(entry) {
  const inputHost = document.getElementById('apiCatalogInputSelector');
  const outputHost = document.getElementById('apiCatalogOutputSelector');
  if (!inputHost || !outputHost || !entry) return;

  const inputOptions = getApiCatalogInputOptions(entry);
  const outputOptions = getApiCatalogOutputOptions(entry);
  ensureApiCatalogFieldSelection(entry, inputOptions, outputOptions);
  const state = apiCatalogFieldSelection.get(entry.id);

  if (!inputOptions.length) {
    inputHost.innerHTML = '';
  } else {
    inputHost.innerHTML = `
      <details class="border rounded p-2">
        <summary><strong>${tr('apiInputFields')}</strong></summary>
        <div class="mt-2">
          ${inputOptions.map((opt) => {
            const checked = state.inputs.has(opt.name) ? 'checked' : '';
            const requiredText = opt.required ? ' *' : '';
            return `<label class="d-block mb-1"><input type="checkbox" data-api-input="${opt.name}" ${checked}> ${opt.label}${requiredText}</label>`;
          }).join('')}
        </div>
      </details>
    `;
  }

  outputHost.innerHTML = `
    <details class="border rounded p-2">
      <summary><strong>${tr('apiOutputFields')}</strong></summary>
      <div class="mt-2">
        ${outputOptions.map((key) => {
          const checked = state.outputs.has(key) ? 'checked' : '';
          return `<label class="d-block mb-1"><input type="checkbox" data-api-output="${key}" ${checked}> ${key}</label>`;
        }).join('')}
      </div>
    </details>
  `;

  inputHost.querySelectorAll('input[data-api-input]').forEach((el) => {
    el.onchange = () => {
      const key = el.getAttribute('data-api-input');
      if (!key) return;
      if (el.checked) state.inputs.add(key);
      else state.inputs.delete(key);
      renderApiCatalogInputs();
    };
  });

  outputHost.querySelectorAll('input[data-api-output]').forEach((el) => {
    el.onchange = () => {
      const key = el.getAttribute('data-api-output');
      if (!key) return;
      if (el.checked) state.outputs.add(key);
      else state.outputs.delete(key);
    };
  });
}

function filterApiPayloadBySelectedOutputs(payload, selectedKeys) {
  if (!selectedKeys || selectedKeys.size === 0) {
    if (Array.isArray(payload)) return [];
    if (payload && typeof payload === 'object') return {};
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const next = {};
      selectedKeys.forEach((k) => {
        if (Object.prototype.hasOwnProperty.call(item, k)) next[k] = item[k];
      });
      return next;
    });
  }

  if (payload && typeof payload === 'object') {
    const next = {};
    selectedKeys.forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(payload, k)) next[k] = payload[k];
    });
    return next;
  }

  return payload;
}

function getSelectedApiCatalogEntry() {
  const select = document.getElementById('apiCatalogSelect');
  if (!select) return null;
  return API_CATALOG.find((entry) => entry.id === select.value) || null;
}

function renderApiCatalogInputs() {
  const entry = getSelectedApiCatalogEntry();
  const inputsHost = document.getElementById('apiCatalogInputs');
  const desc = document.getElementById('apiCatalogDescription');
  const badge = document.getElementById('apiCatalogMethodBadge');
  if (!inputsHost || !desc || !badge) return;

  if (!entry) {
    inputsHost.innerHTML = '';
    desc.textContent = '';
    badge.textContent = '';
    return;
  }

  desc.textContent = getApiCatalogEntryDescription(entry);
  badge.textContent = entry.method;
  badge.className = `badge ${entry.method === 'GET' ? 'bg-info' : 'bg-warning text-dark'}`;

  renderApiCatalogFieldSelectors(entry);

  const selectedInputs = (entry.inputs || []).filter((input) => isApiCatalogInputSelected(entry, input.name));

  if (!selectedInputs.length) {
    inputsHost.innerHTML = `<div class="col-12"><small class="text-muted">${tr('noInputRequired')}</small></div>`;
    return;
  }

  inputsHost.innerHTML = selectedInputs.map((input) => {
    const id = `apiCatalogInput_${input.name}`;
    const requiredMark = input.required ? ' *' : '';

    if (input.name === 'fromLocal' || input.name === 'toLocal') {
      return `
        <div class="col-md-6">
          <label class="form-label mb-1" for="${id}_mode">${input.label}${requiredMark}</label>
          <select id="${id}_mode" class="form-select form-select-sm mb-1">
            <option value="default" selected>-1 (default)</option>
            <option value="custom">Custom date/time</option>
          </select>
          <input id="${id}" class="form-control form-control-sm" type="datetime-local" style="display:none;">
        </div>
      `;
    }

    if (input.type === 'select' && Array.isArray(input.options)) {
      return `
        <div class="col-md-6">
          <label class="form-label mb-1" for="${id}">${input.label}${requiredMark}</label>
          <select id="${id}" class="form-select form-select-sm">
            <option value="">Select</option>
            ${input.options.map((opt) => `<option value="${opt}">${opt}</option>`).join('')}
          </select>
        </div>
      `;
    }

    if (input.type === 'json') {
      const defaultJson = input.name === 'fields' ? '{"value": 1}' : '{}';
      return `
        <div class="col-md-6">
          <label class="form-label mb-1" for="${id}">${input.label}${requiredMark}</label>
          <textarea id="${id}" class="form-control form-control-sm" rows="3">${defaultJson}</textarea>
        </div>
      `;
    }

    const recs = apiCatalogRecommendations(input.recommendationKey || input.name);
    if ((entry.id === 'contract-get-shift-schedule' || entry.id === 'uns-shift-schedule' || entry.id === 'uns-cycle-time') && input.name === 'targetId') {
      return `
        <div class="col-md-6">
          <label class="form-label mb-1" for="${id}">${input.label}${requiredMark}</label>
          <select id="${id}" class="form-select form-select-sm">
            <option value="">Select</option>
          </select>
        </div>
      `;
    }
    if (Array.isArray(recs) && recs.length > 0) {
      return `
        <div class="col-md-6">
          <label class="form-label mb-1" for="${id}">${input.label}${requiredMark}</label>
          <select id="${id}" class="form-select form-select-sm">
            <option value="">Select</option>
            ${recs.map((value) => `<option value="${value}">${value}</option>`).join('')}
          </select>
        </div>
      `;
    }
    return `
      <div class="col-md-6">
        <label class="form-label mb-1" for="${id}">${input.label}${requiredMark}</label>
        <input id="${id}" class="form-control form-control-sm" ${input.type === 'number' ? 'type="number"' : 'type="text"'} value="${input.name === 'fromLocal' ? '-1' : (input.name === 'toLocal' ? '-1' : '')}">
      </div>
    `;
  }).join('');

  selectedInputs.forEach((input) => {
    if (input.name !== 'fromLocal' && input.name !== 'toLocal') return;

    const baseId = `apiCatalogInput_${input.name}`;
    const modeEl = document.getElementById(`${baseId}_mode`);
    const dateEl = document.getElementById(baseId);
    if (!modeEl || !dateEl) return;

    const syncMode = () => {
      const isCustom = modeEl.value === 'custom';
      dateEl.style.display = isCustom ? '' : 'none';
      dateEl.disabled = !isCustom;
      if (!isCustom) {
        dateEl.value = '';
      }
    };

    modeEl.onchange = syncMode;
    syncMode();
  });

  if (entry.id === 'contract-get-shift-schedule' || entry.id === 'uns-shift-schedule' || entry.id === 'uns-cycle-time') {
    const typeEl = document.getElementById('apiCatalogInput_targetType');
    const targetEl = document.getElementById('apiCatalogInput_targetId');
    const refillTargets = () => {
      if (!targetEl) return;
      const t = typeEl && typeEl.value === 'line' ? 'line' : 'station';
      const values = t === 'line'
        ? (Array.isArray(lines) ? lines.map((l) => String(l.id || '')).filter(Boolean) : [])
        : (Array.isArray(stations) ? stations.map((s) => String(s.id || '')).filter(Boolean) : []);
      targetEl.innerHTML = '<option value="">Select</option>' + values.map((v) => `<option value="${v}">${v}</option>`).join('');
    };
    if (typeEl) {
      typeEl.onchange = refillTargets;
      refillTargets();
    }
  }
}

function buildApiCatalogRequest(entry) {
  let path = entry.path;
  const queryParts = new URLSearchParams();
  const body = {};

  const selectedInputs = (entry.inputs || []).filter((input) => isApiCatalogInputSelected(entry, input.name));

  for (const input of selectedInputs) {
    const el = document.getElementById(`apiCatalogInput_${input.name}`);
    let raw = el ? String(el.value || '').trim() : '';

    if (input.name === 'fromLocal' || input.name === 'toLocal') {
      const modeEl = document.getElementById(`apiCatalogInput_${input.name}_mode`);
      if (modeEl && modeEl.value !== 'custom') {
        raw = '-1';
      }
    }

    if (input.required && !raw) {
      throw new Error(`Missing required input: ${input.label}`);
    }
    if (!raw) {
      continue;
    }

    let value = raw;
    if (input.type === 'number') {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        throw new Error(`Invalid number for ${input.label}`);
      }
      value = n;
    }
    if (input.type === 'json') {
      try {
        value = JSON.parse(raw);
      } catch (_) {
        throw new Error(`Invalid JSON for ${input.label}`);
      }
    }
    if (input.type === 'select' && (raw === 'true' || raw === 'false')) {
      value = raw === 'true';
    }

    if (input.location === 'virtual') {
      continue;
    }

    if ((entry.id === 'contract-get-shift-schedule' || entry.id === 'uns-shift-schedule' || entry.id === 'uns-cycle-time') && input.name === 'targetId') {
      const targetTypeEl = document.getElementById('apiCatalogInput_targetType');
      const key = targetTypeEl && targetTypeEl.value === 'line' ? 'lineId' : 'stationId';
      queryParts.set(key, String(value));
      continue;
    }

    if (input.location === 'path') {
      path = path.replace(`:${input.name}`, encodeURIComponent(String(value)));
    } else if (input.location === 'query') {
      queryParts.set(input.name, String(value));
    } else {
      body[input.name] = value;
    }
  }

  const queryString = queryParts.toString();
  const url = queryString ? `${path}?${queryString}` : path;
  const options = { method: entry.method, headers: {} };
  if (entry.method !== 'GET') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  return { url, options };
}

window.testSelectedApiEndpoint = async function() {
  const output = document.getElementById('apiCatalogResult');
  const entry = getSelectedApiCatalogEntry();
  if (!output || !entry) return;

  try {
    const { url, options } = buildApiCatalogRequest(entry);
    output.textContent = `Running ${entry.method} ${url} ...`;

    const res = await fetch(url, options);
    const text = await res.text();
    let payload = text;
    try {
      payload = JSON.parse(text);
    } catch (_) {
      payload = text;
    }

    const outputKeys = extractApiPayloadTopKeys(payload);
    if (outputKeys.length > 0) {
      apiCatalogOutputHints.set(entry.id, outputKeys);
      renderApiCatalogFieldSelectors(entry);
    }

    const filteredPayload = typeof payload === 'string'
      ? payload
      : filterApiPayloadBySelectedOutputs(payload, getSelectedApiCatalogOutputKeys(entry));

    const header = `${tr('apiHeaderStatus')}: ${res.status} ${res.statusText}\n${tr('apiHeaderMethod')}: ${entry.method}\n${tr('apiHeaderUrl')}: ${url}\n\n`;
    output.textContent = header + (typeof filteredPayload === 'string' ? filteredPayload : JSON.stringify(filteredPayload, null, 2));
  } catch (err) {
    output.textContent = `${tr('errorLabel')}: ${err && err.message ? err.message : tr('unknownError')}`;
  }
};

window.refreshApiCatalogInputs = function() {
  renderApiCatalogInputs();
};

function populateApiCatalogUI() {
  const select = document.getElementById('apiCatalogSelect');
  if (!select) return;

  const current = select.value;
  let lastSection = '';
  let lastMethod = '';
  const optionsHtml = [];
  for (const entry of API_CATALOG) {
    const section = getApiCatalogSection(entry);
    const method = String(entry.method || '').toUpperCase();

    if (section !== lastSection) {
      optionsHtml.push(`<option value="" disabled>======== ${getApiCatalogSectionLabel(section)} ========</option>`);
      lastSection = section;
      lastMethod = '';
    }

    if (method !== lastMethod) {
      optionsHtml.push(`<option value="" disabled>──────── ${method} ────────</option>`);
      lastMethod = method;
    }

    const visibleLabel = method === 'DELETE'
      ? `! ${entry.label}`
      : entry.label;
    optionsHtml.push(`<option value="${entry.id}">${visibleLabel}</option>`);
  }

  select.innerHTML = optionsHtml.join('');
  if (current && API_CATALOG.some((entry) => entry.id === current)) {
    select.value = current;
  }

  if (!select.value && API_CATALOG.length > 0) {
    select.value = API_CATALOG[0].id;
  }

  select.onchange = renderApiCatalogInputs;
  renderApiCatalogInputs();
}

// --- API helpers for stations, lines, shifts ---
async function saveStationToApi(station) {
  return fetch('/api/station', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(station)
  });
}

async function saveLineToApi(line) {
  return fetch('/api/line', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(line)
  });
}

async function saveShiftToApi(shift) {
  return fetch('/api/shift', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(shift)
  });
}

async function fetchStationsFromApi() {
  const res = await fetch('/api/stations');
  return res.json();
}

async function fetchLinesFromApi() {
  const res = await fetch('/api/lines');
  return res.json();
}

async function fetchShiftsFromApi() {
  const res = await fetch('/api/shifts');
  return res.json();
}
// Example/test function to send a point to InfluxDB via backend
window.sendTestPoint = async function() {
  const ok = await sendPointToApi(
    'test_measurement',
    { value: Math.random() * 100, timestamp: Date.now() },
    { user: 'frontend' }
  );
  if (ok) alert(tr('sendTestPointSuccess'));
};

window.repairSqlIntegrity = async function() {
  const statusEl = document.getElementById('sqlRepairStatus');
  const repairBtn = document.getElementById('sqlRepairBtn');

  const setStatus = (text) => {
    if (statusEl) {
      statusEl.textContent = `[${nowLabel()}] ${text}`;
    }
  };

  const proceed = window.confirm(tr('runSqlRepairConfirm'));
  if (!proceed) {
    setStatus(tr('repairCancelled'));
    return;
  }

  if (repairBtn) {
    repairBtn.disabled = true;
  }

  try {
    setStatus(tr('repairRunning'));

    const body = await fetchJsonWithFriendlyErrors('/api/sql-integrity-repair', 'SQL integrity repair failed.', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const report = body.report || {};
    const after = report.after || {};
    const repaired = Number(report.repairedStationsWithoutLine || 0);
    const message = `${tr('repairCompletedPrefix')} ${tr('fixedRowsLabel')}: ${repaired}. ${tr('statusLabel')}: stationsWithoutLine=${after.stationsWithoutLine ?? 'n/a'}, assignmentsWithoutTarget=${after.assignmentsWithoutTarget ?? 'n/a'}, inconsistentTargetType=${after.inconsistentTargetType ?? 'n/a'}`;
    setStatus(message);
    alert(message);
  } finally {
    if (repairBtn) {
      repairBtn.disabled = false;
    }
  }
};
// Send a point to the backend API for InfluxDB
async function sendPointToApi(measurement, fields, tags = {}) {
  const res = await fetch('/api/point', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ measurement, fields, tags })
  });
  if (!res.ok) {
    const message = await parseApiErrorMessage(res, 'Sending data to API failed.');
    alert(message);
    return false;
  }
  return true;
}

window.runSystemHealthCheck = async function() {
  const healthBtn = document.getElementById('healthCheckBtn');
  const statusEl = document.getElementById('healthCheckStatus');

  const setHealthStatus = (html) => {
    if (statusEl) {
      statusEl.innerHTML = html;
    }
  };

  const colorFor = (state) => {
    if (state === 'ok') return '#00e676';
    if (state === 'warn') return '#ffc107';
    return '#ff3b3b';
  };

  const checks = [
    { name: tr('stationsApi'), url: '/api/stations' },
    { name: tr('linesApi'), url: '/api/lines' },
    { name: tr('shiftsApi'), url: '/api/shifts' },
    { name: tr('sqlIntegrityApi'), url: '/api/sql-integrity' }
  ];

  if (healthBtn) {
    healthBtn.disabled = true;
  }

  try {
    setHealthStatus(`[${nowLabel()}] ${tr('runningHealthCheck')}`);
    const results = [];

    for (const check of checks) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch(check.url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const message = await parseApiErrorMessage(res, `${check.name} failed.`);
          results.push({ name: check.name, state: 'fail', detail: message });
          continue;
        }

        let data = null;
        try {
          data = await res.json();
        } catch (_) {
          data = null;
        }

        if (check.url === '/api/sql-integrity' && data) {
          const hasIssues = Number(data.stationsWithoutLine || 0) > 0
            || Number(data.assignmentsWithoutTarget || 0) > 0
            || Number(data.inconsistentTargetType || 0) > 0;
          if (hasIssues) {
            results.push({
              name: check.name,
              state: 'warn',
              detail: `${tr('integrityWarningsPrefix')}: stationsWithoutLine=${data.stationsWithoutLine || 0}, assignmentsWithoutTarget=${data.assignmentsWithoutTarget || 0}, inconsistentTargetType=${data.inconsistentTargetType || 0}`
            });
          } else {
            results.push({ name: check.name, state: 'ok', detail: tr('healthyText') });
          }
        } else {
          results.push({ name: check.name, state: 'ok', detail: tr('healthyText') });
        }
      } catch (err) {
        clearTimeout(timeoutId);
        results.push({ name: check.name, state: 'fail', detail: parseNetworkErrorMessage(err, `${check.name} failed.`) });
      }
    }

    const hasFail = results.some(r => r.state === 'fail');
    const hasWarn = results.some(r => r.state === 'warn');
    const overall = hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';
    const overallLabel = overall === 'ok' ? tr('systemHealthy') : overall === 'warn' ? tr('systemDegraded') : tr('systemUnhealthy');

    const lines = results.map(r => {
      const dot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colorFor(r.state)};margin-right:8px;"></span>`;
      return `${dot}<strong>${r.name}</strong>: ${r.detail}`;
    }).join('<br>');

    const summaryDot = `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${colorFor(overall)};margin-right:8px;"></span>`;
    setHealthStatus(`[${nowLabel()}] ${summaryDot}<strong>${overallLabel}</strong><br>${lines}`);
  } finally {
    if (healthBtn) {
      healthBtn.disabled = false;
    }
  }
};

let mqttExplorerPollTimer = null;
const mqttPayloadVariables = new Map();
const MQTT_EXPLORER_PROFILE_STORAGE_KEY = 'fld-syncboard-mqtt-profile-v1';
const MQTT_EXPLORER_PROFILE_COLLECTION_STORAGE_KEY = 'fld-syncboard-mqtt-profiles-v1';

function mqttExplorerBuildProfile(options = {}) {
  const includeSecrets = options.includeSecrets === true;
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    connection: {
      host: String(document.getElementById('mqttHost')?.value || '').trim(),
      port: Number(document.getElementById('mqttPort')?.value || 0),
      protocol: String(document.getElementById('mqttProtocol')?.value || 'mqtts').trim(),
      clientId: String(document.getElementById('mqttClientId')?.value || '').trim(),
      username: String(document.getElementById('mqttUsername')?.value || '').trim(),
      password: includeSecrets ? String(document.getElementById('mqttPassword')?.value || '') : '',
      keepalive: Number(document.getElementById('mqttKeepalive')?.value || 60),
      connectTimeout: Number(document.getElementById('mqttConnectTimeout')?.value || 10000),
      reconnectPeriod: Number(document.getElementById('mqttReconnectPeriod')?.value || 1000),
      clean: document.getElementById('mqttClean')?.checked !== false,
      rejectUnauthorized: document.getElementById('mqttRejectUnauthorized')?.checked !== false,
      caPem: String(document.getElementById('mqttCaPem')?.value || '')
    },
    topicSettings: {
      topic: String(document.getElementById('mqttTopic')?.value || '').trim(),
      qos: Number(document.getElementById('mqttQos')?.value || 0),
      retain: document.getElementById('mqttRetain')?.checked === true
    },
    payloadSettings: {
      payload: String(document.getElementById('mqttPayload')?.value || ''),
      parseAsJson: document.getElementById('mqttPublishAsJson')?.checked !== false,
      variables: Array.from(mqttPayloadVariables.entries()).map(([key, value]) => ({ key, value }))
    },
    metadata: {
      secretsIncluded: includeSecrets
    }
  };
}

function mqttExplorerReadProfileCollection() {
  try {
    const raw = localStorage.getItem(MQTT_EXPLORER_PROFILE_COLLECTION_STORAGE_KEY);
    if (!raw) return { selectedName: 'default', profiles: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { selectedName: 'default', profiles: {} };
    const selectedName = String(parsed.selectedName || 'default').trim() || 'default';
    const profiles = parsed.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : {};
    return { selectedName, profiles };
  } catch (_) {
    return { selectedName: 'default', profiles: {} };
  }
}

function mqttExplorerWriteProfileCollection(collection) {
  const selectedName = String(collection?.selectedName || 'default').trim() || 'default';
  const profiles = collection?.profiles && typeof collection.profiles === 'object' ? collection.profiles : {};
  localStorage.setItem(
    MQTT_EXPLORER_PROFILE_COLLECTION_STORAGE_KEY,
    JSON.stringify({ selectedName, profiles })
  );
}

function mqttExplorerNormalizeProfileName(value) {
  return String(value || '').trim();
}

function mqttExplorerGetSelectedProfileName() {
  const select = document.getElementById('mqttProfileSelect');
  const selected = mqttExplorerNormalizeProfileName(select?.value || 'default');
  return selected || 'default';
}

function mqttExplorerRefreshProfileCatalog() {
  const select = document.getElementById('mqttProfileSelect');
  if (!select) return;

  const collection = mqttExplorerReadProfileCollection();
  const names = Object.keys(collection.profiles || {});
  if (!names.includes('default')) names.unshift('default');

  select.innerHTML = names
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `<option value="${name.replace(/"/g, '&quot;')}">${name}</option>`)
    .join('');

  const selected = names.includes(collection.selectedName) ? collection.selectedName : names[0] || 'default';
  select.value = selected;
}

function mqttExplorerSaveNamedProfile(name, options = {}) {
  const profileName = mqttExplorerNormalizeProfileName(name) || 'default';
  const includeSecrets = options.includeSecrets !== false;
  const collection = mqttExplorerReadProfileCollection();
  collection.profiles[profileName] = mqttExplorerBuildProfile({ includeSecrets });
  collection.selectedName = profileName;
  mqttExplorerWriteProfileCollection(collection);
  localStorage.setItem(MQTT_EXPLORER_PROFILE_STORAGE_KEY, JSON.stringify(collection.profiles[profileName]));
  mqttExplorerRefreshProfileCatalog();
}

function mqttExplorerGetImportConflictMode() {
  const mode = String(document.getElementById('mqttImportConflictMode')?.value || 'overwrite').trim().toLowerCase();
  return mode === 'rename' ? 'rename' : 'overwrite';
}

function mqttExplorerResolveImportedProfileName(rawName, profiles, mode) {
  const baseName = mqttExplorerNormalizeProfileName(rawName) || 'imported-profile';
  if (mode !== 'rename') {
    return baseName;
  }

  const taken = new Set(Object.keys(profiles || {}));
  if (!taken.has(baseName)) {
    return baseName;
  }

  let suffix = 2;
  while (taken.has(`${baseName}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseName}-${suffix}`;
}

function mqttExplorerEnsureProfileCollectionInitialized() {
  const collection = mqttExplorerReadProfileCollection();
  const hasAnyProfiles = Object.keys(collection.profiles || {}).length > 0;
  if (hasAnyProfiles) return;

  let fallbackProfile = null;
  try {
    const legacy = localStorage.getItem(MQTT_EXPLORER_PROFILE_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed && typeof parsed === 'object') {
        fallbackProfile = parsed;
      }
    }
  } catch (_) {
    fallbackProfile = null;
  }

  const nextCollection = {
    selectedName: 'default',
    profiles: {
      default: fallbackProfile || mqttExplorerBuildProfile({ includeSecrets: true })
    }
  };
  mqttExplorerWriteProfileCollection(nextCollection);
}

function mqttExplorerApplyProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('Invalid MQTT profile format');
  }

  const connection = profile.connection || {};
  const topicSettings = profile.topicSettings || {};
  const payloadSettings = profile.payloadSettings || {};

  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (!el || value == null) return;
    el.value = String(value);
  };
  const setChecked = (id, value) => {
    const el = document.getElementById(id);
    if (!el || typeof value !== 'boolean') return;
    el.checked = value;
  };

  setValue('mqttHost', connection.host);
  setValue('mqttPort', connection.port);
  setValue('mqttProtocol', connection.protocol);
  setValue('mqttClientId', connection.clientId);
  setValue('mqttUsername', connection.username);
  setValue('mqttPassword', connection.password);
  setValue('mqttKeepalive', connection.keepalive);
  setValue('mqttConnectTimeout', connection.connectTimeout);
  setValue('mqttReconnectPeriod', connection.reconnectPeriod);
  setChecked('mqttClean', connection.clean);
  setChecked('mqttRejectUnauthorized', connection.rejectUnauthorized);
  setValue('mqttCaPem', connection.caPem);

  setValue('mqttTopic', topicSettings.topic);
  setValue('mqttQos', topicSettings.qos);
  setChecked('mqttRetain', topicSettings.retain);

  setValue('mqttPayload', payloadSettings.payload);
  setChecked('mqttPublishAsJson', payloadSettings.parseAsJson);

  mqttPayloadVariables.clear();
  if (Array.isArray(payloadSettings.variables)) {
    payloadSettings.variables.forEach((item) => {
      const key = String(item?.key || '').trim();
      if (!key) return;
      mqttPayloadVariables.set(key, String(item?.value || ''));
    });
  }
  mqttExplorerRenderVariables();
}

function mqttExplorerPersistProfileToStorage() {
  try {
    const selectedName = mqttExplorerGetSelectedProfileName();
    mqttExplorerSaveNamedProfile(selectedName, { includeSecrets: true });
  } catch (_) {
    // Ignore local persistence failures in private mode or restricted browsers.
  }
}

function mqttExplorerLoadProfileFromStorage() {
  try {
    mqttExplorerEnsureProfileCollectionInitialized();
    mqttExplorerRefreshProfileCatalog();
    const collection = mqttExplorerReadProfileCollection();
    const selectedName = mqttExplorerNormalizeProfileName(collection.selectedName) || 'default';
    const parsed = collection.profiles[selectedName] || collection.profiles.default || null;
    if (!parsed) return;
    mqttExplorerApplyProfile(parsed);
  } catch (_) {
    // Ignore invalid local storage content.
  }
}

function mqttExplorerSetStatus(message, isError = false) {
  const el = document.getElementById('mqttExplorerStatus');
  if (!el) return;
  el.style.color = isError ? 'var(--accent-red)' : 'var(--accent-grey)';
  el.textContent = `[${nowLabel()}] ${String(message || '')}`;
}

function mqttExplorerRenderVariables() {
  const host = document.getElementById('mqttPayloadVariables');
  if (!host) return;
  if (mqttPayloadVariables.size === 0) {
    host.textContent = 'Payload variables: none';
    return;
  }

  const parts = Array.from(mqttPayloadVariables.entries()).map(([key, value]) => `${key}=${value}`);
  host.textContent = `Payload variables: ${parts.join(' | ')}`;
}

function mqttExplorerApplyVariables(template) {
  let out = String(template || '');
  for (const [key, value] of mqttPayloadVariables.entries()) {
    out = out.split(`\${${key}}`).join(String(value));
  }
  return out;
}

function mqttExplorerNormalizePayload() {
  const payloadInput = document.getElementById('mqttPayload');
  const parseAsJson = document.getElementById('mqttPublishAsJson')?.checked === true;
  const rawPayload = mqttExplorerApplyVariables(payloadInput?.value || '');

  if (!parseAsJson) {
    return rawPayload;
  }

  const trimmed = rawPayload.trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new Error(`Payload JSON parse failed: ${err.message || err}`);
  }
}

function mqttExplorerRenderMessages(messages) {
  const out = document.getElementById('mqttExplorerMessages');
  if (!out) return;
  if (!Array.isArray(messages) || messages.length === 0) {
    out.textContent = 'No messages yet.';
    return;
  }

  out.textContent = JSON.stringify(messages, null, 2);
}

function mqttExplorerReadConfig() {
  const host = String(document.getElementById('mqttHost')?.value || '').trim();
  const port = Number(document.getElementById('mqttPort')?.value || 0);
  const protocol = String(document.getElementById('mqttProtocol')?.value || 'mqtts').trim();
  const clientId = String(document.getElementById('mqttClientId')?.value || '').trim();
  const username = String(document.getElementById('mqttUsername')?.value || '').trim();
  const password = String(document.getElementById('mqttPassword')?.value || '');
  const keepalive = Number(document.getElementById('mqttKeepalive')?.value || 60);
  const connectTimeout = Number(document.getElementById('mqttConnectTimeout')?.value || 10000);
  const reconnectPeriod = Number(document.getElementById('mqttReconnectPeriod')?.value || 1000);
  const clean = document.getElementById('mqttClean')?.checked !== false;
  const rejectUnauthorized = document.getElementById('mqttRejectUnauthorized')?.checked !== false;
  const caPem = String(document.getElementById('mqttCaPem')?.value || '').trim();

  if (!host) throw new Error('Host is required');
  if (!Number.isInteger(port) || port <= 0) throw new Error('Port must be a positive integer');

  return {
    host,
    port,
    protocol,
    clientId,
    username,
    password,
    keepalive,
    connectTimeout,
    reconnectPeriod,
    clean,
    rejectUnauthorized,
    caPem
  };
}

async function mqttExplorerPollMessages() {
  try {
    const body = await fetchJsonWithFriendlyErrors('/api/mqtt-explorer/messages?limit=200', 'Loading MQTT messages failed.');
    mqttExplorerRenderMessages(body.messages || []);
  } catch (err) {
    mqttExplorerSetStatus(err.message || 'Loading MQTT messages failed.', true);
  }
}

function mqttExplorerStartPolling() {
  if (mqttExplorerPollTimer) {
    clearInterval(mqttExplorerPollTimer);
  }
  mqttExplorerPollTimer = setInterval(() => {
    mqttExplorerPollMessages();
  }, 2000);
}

function mqttExplorerStopPolling() {
  if (mqttExplorerPollTimer) {
    clearInterval(mqttExplorerPollTimer);
    mqttExplorerPollTimer = null;
  }
}

window.mqttExplorerRefreshStatus = async function() {
  try {
    const body = await fetchJsonWithFriendlyErrors('/api/mqtt-explorer/status', 'Loading MQTT status failed.');
    const mqtt = body || {};
    const connected = mqtt.connected === true;
    const subs = Array.isArray(mqtt.subscriptions) ? mqtt.subscriptions.length : 0;
    const msg = connected
      ? `MQTT connected. Subscriptions=${subs}, bufferedMessages=${mqtt.messageCount || 0}`
      : `MQTT disconnected.${mqtt.lastError ? ` Last error: ${mqtt.lastError}` : ''}`;
    mqttExplorerSetStatus(msg, !connected && Boolean(mqtt.lastError));
    if (connected) {
      mqttExplorerStartPolling();
      await mqttExplorerPollMessages();
    } else {
      mqttExplorerStopPolling();
    }
  } catch (err) {
    mqttExplorerSetStatus(err.message || 'Loading MQTT status failed.', true);
  }
};

window.mqttExplorerConnect = async function() {
  try {
    const config = mqttExplorerReadConfig();
    mqttExplorerPersistProfileToStorage();
    await fetchJsonWithFriendlyErrors('/api/mqtt-explorer/connect', 'MQTT connect failed.', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    mqttExplorerSetStatus(`Connected to ${config.protocol}://${config.host}:${config.port}`);
    mqttExplorerStartPolling();
    await mqttExplorerPollMessages();
  } catch (err) {
    mqttExplorerSetStatus(err.message || 'MQTT connect failed.', true);
  }
};

window.mqttExplorerDisconnect = async function() {
  try {
    await fetchJsonWithFriendlyErrors('/api/mqtt-explorer/disconnect', 'MQTT disconnect failed.', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    mqttExplorerStopPolling();
    mqttExplorerSetStatus('Disconnected.');
  } catch (err) {
    mqttExplorerSetStatus(err.message || 'MQTT disconnect failed.', true);
  }
};

window.mqttExplorerSubscribe = async function() {
  try {
    const topic = String(document.getElementById('mqttTopic')?.value || '').trim();
    const qos = Number(document.getElementById('mqttQos')?.value || 0);
    if (!topic) throw new Error('Topic is required for subscribe');
    mqttExplorerPersistProfileToStorage();
    await fetchJsonWithFriendlyErrors('/api/mqtt-explorer/subscribe', 'MQTT subscribe failed.', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, qos })
    });
    mqttExplorerSetStatus(`Subscribed to ${topic} (QoS ${qos})`);
    await mqttExplorerRefreshStatus();
  } catch (err) {
    mqttExplorerSetStatus(err.message || 'MQTT subscribe failed.', true);
  }
};

window.mqttExplorerUnsubscribe = async function() {
  try {
    const topic = String(document.getElementById('mqttTopic')?.value || '').trim();
    if (!topic) throw new Error('Topic is required for unsubscribe');
    mqttExplorerPersistProfileToStorage();
    await fetchJsonWithFriendlyErrors('/api/mqtt-explorer/unsubscribe', 'MQTT unsubscribe failed.', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic })
    });
    mqttExplorerSetStatus(`Unsubscribed from ${topic}`);
    await mqttExplorerRefreshStatus();
  } catch (err) {
    mqttExplorerSetStatus(err.message || 'MQTT unsubscribe failed.', true);
  }
};

window.mqttExplorerPublish = async function() {
  try {
    const topic = String(document.getElementById('mqttTopic')?.value || '').trim();
    const qos = Number(document.getElementById('mqttQos')?.value || 0);
    const retain = document.getElementById('mqttRetain')?.checked === true;
    if (!topic) throw new Error('Topic is required for publish');

    const payload = mqttExplorerNormalizePayload();
    mqttExplorerPersistProfileToStorage();
    await fetchJsonWithFriendlyErrors('/api/mqtt-explorer/publish', 'MQTT publish failed.', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, qos, retain, payload })
    });

    mqttExplorerSetStatus(`Published to ${topic} (QoS ${qos}, retain=${retain})`);
  } catch (err) {
    mqttExplorerSetStatus(err.message || 'MQTT publish failed.', true);
  }
};

window.mqttExplorerLoadMessages = async function() {
  await mqttExplorerPollMessages();
};

window.mqttExplorerClearMessages = async function() {
  try {
    await fetchJsonWithFriendlyErrors('/api/mqtt-explorer/messages/clear', 'Clearing MQTT messages failed.', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    mqttExplorerRenderMessages([]);
    mqttExplorerSetStatus('Message buffer cleared.');
  } catch (err) {
    mqttExplorerSetStatus(err.message || 'Clearing MQTT messages failed.', true);
  }
};

window.mqttExplorerAddPayloadVariable = function() {
  const key = String(document.getElementById('mqttPayloadVarKey')?.value || '').trim();
  const value = String(document.getElementById('mqttPayloadVarValue')?.value || '');
  if (!key) {
    mqttExplorerSetStatus('Variable key is required.', true);
    return;
  }
  mqttPayloadVariables.set(key, value);
  mqttExplorerRenderVariables();
  mqttExplorerPersistProfileToStorage();
  mqttExplorerSetStatus(`Variable set: ${key}`);
};

window.mqttExplorerClearPayloadVariables = function() {
  mqttPayloadVariables.clear();
  mqttExplorerRenderVariables();
  mqttExplorerPersistProfileToStorage();
  mqttExplorerSetStatus('Payload variables cleared.');
};

window.mqttExplorerSaveProfile = function() {
  try {
    const selectedName = mqttExplorerGetSelectedProfileName();
    mqttExplorerSaveNamedProfile(selectedName, { includeSecrets: true });
    mqttExplorerSetStatus(`MQTT settings saved to profile: ${selectedName}`);
  } catch (err) {
    mqttExplorerSetStatus(err?.message || 'Saving MQTT settings failed.', true);
  }
};

window.mqttExplorerSaveProfileAs = function() {
  try {
    const nameInput = document.getElementById('mqttProfileName');
    const profileName = mqttExplorerNormalizeProfileName(nameInput?.value || '');
    if (!profileName) {
      mqttExplorerSetStatus('Please enter a profile name.', true);
      return;
    }
    mqttExplorerSaveNamedProfile(profileName, { includeSecrets: true });
    mqttExplorerSetStatus(`MQTT settings saved as profile: ${profileName}`);
  } catch (err) {
    mqttExplorerSetStatus(err?.message || 'Saving MQTT profile failed.', true);
  }
};

window.mqttExplorerLoadSelectedProfile = function() {
  try {
    const selectedName = mqttExplorerGetSelectedProfileName();
    const collection = mqttExplorerReadProfileCollection();
    const profile = collection.profiles[selectedName];
    if (!profile) {
      mqttExplorerSetStatus(`Profile not found: ${selectedName}`, true);
      return;
    }
    mqttExplorerApplyProfile(profile);
    collection.selectedName = selectedName;
    mqttExplorerWriteProfileCollection(collection);
    localStorage.setItem(MQTT_EXPLORER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    mqttExplorerSetStatus(`MQTT profile loaded: ${selectedName}`);
  } catch (err) {
    mqttExplorerSetStatus(err?.message || 'Loading MQTT profile failed.', true);
  }
};

window.mqttExplorerDuplicateSelectedProfile = function() {
  try {
    const selectedName = mqttExplorerGetSelectedProfileName();
    const collection = mqttExplorerReadProfileCollection();
    const sourceProfile = collection.profiles[selectedName];
    if (!sourceProfile) {
      mqttExplorerSetStatus(`Profile not found: ${selectedName}`, true);
      return;
    }

    const preferredName = mqttExplorerNormalizeProfileName(document.getElementById('mqttProfileName')?.value || '')
      || `${selectedName}-copy`;
    const targetName = mqttExplorerResolveImportedProfileName(preferredName, collection.profiles, 'rename');

    collection.profiles[targetName] = JSON.parse(JSON.stringify(sourceProfile));
    collection.selectedName = targetName;
    mqttExplorerWriteProfileCollection(collection);
    localStorage.setItem(MQTT_EXPLORER_PROFILE_STORAGE_KEY, JSON.stringify(collection.profiles[targetName]));
    mqttExplorerRefreshProfileCatalog();
    mqttExplorerSetStatus(`MQTT profile duplicated: ${selectedName} -> ${targetName}`);
  } catch (err) {
    mqttExplorerSetStatus(err?.message || 'Duplicating MQTT profile failed.', true);
  }
};

window.mqttExplorerDeleteSelectedProfile = function() {
  try {
    const selectedName = mqttExplorerGetSelectedProfileName();
    if (selectedName === 'default') {
      mqttExplorerSetStatus('Default profile cannot be deleted.', true);
      return;
    }

    const collection = mqttExplorerReadProfileCollection();
    if (!collection.profiles[selectedName]) {
      mqttExplorerSetStatus(`Profile not found: ${selectedName}`, true);
      return;
    }

    delete collection.profiles[selectedName];
    collection.selectedName = 'default';
    mqttExplorerWriteProfileCollection(collection);
    mqttExplorerRefreshProfileCatalog();
    mqttExplorerSetStatus(`MQTT profile deleted: ${selectedName}`);
  } catch (err) {
    mqttExplorerSetStatus(err?.message || 'Deleting MQTT profile failed.', true);
  }
};

window.mqttExplorerExportProfile = function() {
  try {
    const includePassword = document.getElementById('mqttExportIncludePassword')?.checked === true;
    const profileName = mqttExplorerGetSelectedProfileName();
    const profile = mqttExplorerBuildProfile({ includeSecrets: includePassword });
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${profileName || 'mqtt'}-topic-payload-settings.mqtt-profile.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    mqttExplorerSetStatus(
      `MQTT settings exported (${includePassword ? 'with password' : 'without password'}).`
    );
  } catch (err) {
    mqttExplorerSetStatus(err?.message || 'Exporting MQTT settings failed.', true);
  }
};

window.mqttExplorerImportProfile = function() {
  const fileInput = document.getElementById('mqttProfileFile');
  if (!fileInput) {
    mqttExplorerSetStatus('Settings import control not found.', true);
    return;
  }
  fileInput.click();
};

window.mqttExplorerHandleProfileFile = function(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || '');
      const parsed = JSON.parse(text);
      const profileNameBase = String(file.name || 'imported-profile').replace(/\.[^.]+$/, '').trim() || 'imported-profile';
      const collection = mqttExplorerReadProfileCollection();
      const conflictMode = mqttExplorerGetImportConflictMode();

      if (parsed && typeof parsed === 'object' && parsed.profiles && typeof parsed.profiles === 'object') {
        let importedCount = 0;
        let renamedCount = 0;
        let overwrittenCount = 0;
        const importedNameMap = {};

        Object.keys(parsed.profiles).forEach((name) => {
          const normalized = mqttExplorerNormalizeProfileName(name);
          if (!normalized) return;
          const targetName = mqttExplorerResolveImportedProfileName(normalized, collection.profiles, conflictMode);
          if (collection.profiles[targetName]) {
            overwrittenCount += 1;
          }
          if (targetName !== normalized) {
            renamedCount += 1;
          }
          collection.profiles[targetName] = parsed.profiles[name];
          importedNameMap[normalized] = targetName;
          importedCount += 1;
        });

        const importedSelectedRaw = mqttExplorerNormalizeProfileName(parsed.selectedName);
        const importedSelectedResolved = importedSelectedRaw ? importedNameMap[importedSelectedRaw] || '' : '';
        collection.selectedName = importedSelectedResolved || collection.selectedName || 'default';
        mqttExplorerWriteProfileCollection(collection);
        mqttExplorerRefreshProfileCatalog();
        window.mqttExplorerLoadSelectedProfile();
        mqttExplorerSetStatus(
          `MQTT profile set imported: ${file.name} (${importedCount} profiles, ${overwrittenCount} overwritten, ${renamedCount} renamed)`
        );
      } else {
        mqttExplorerApplyProfile(parsed);
        const importedName = mqttExplorerResolveImportedProfileName(profileNameBase, collection.profiles, conflictMode);
        mqttExplorerSaveNamedProfile(importedName, { includeSecrets: true });
        mqttExplorerSetStatus(
          `MQTT settings imported as profile: ${importedName}${importedName !== profileNameBase ? ` (renamed from ${profileNameBase})` : ''}`
        );
      }
    } catch (err) {
      mqttExplorerSetStatus(err?.message || 'Importing MQTT settings failed.', true);
    }
  };

  reader.onerror = () => {
    mqttExplorerSetStatus('Reading MQTT settings file failed.', true);
  };

  reader.readAsText(file);
  if (event?.target) {
    event.target.value = '';
  }
};

window.mqttExplorerImportCaPem = function() {
  const fileInput = document.getElementById('mqttCaPemFile');
  if (!fileInput) {
    mqttExplorerSetStatus('Certificate import control not found.', true);
    return;
  }
  fileInput.click();
};

window.mqttExplorerLoadMagnaPem = async function() {
  try {
    if (window.showOpenFilePicker) {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: false,
        suggestedName: 'magna_global_fullchain.pem',
        types: [
          {
            description: 'PEM certificate files',
            accept: {
              'application/x-pem-file': ['.pem'],
              'text/plain': ['.pem']
            }
          }
        ]
      });

      if (!handle) {
        return;
      }

      const file = await handle.getFile();
      const lowerName = String(file.name || '').toLowerCase();
      if (!lowerName.endsWith('.pem')) {
        mqttExplorerSetStatus('Only .pem certificate files are allowed.', true);
        return;
      }

      const text = await file.text();
      const caPemInput = document.getElementById('mqttCaPem');
      if (!caPemInput) {
        mqttExplorerSetStatus('CA PEM field not found.', true);
        return;
      }

      caPemInput.value = text;
      mqttExplorerSetStatus(`Certificate loaded: ${file.name}`);
      return;
    }

    mqttExplorerSetStatus('Browser picker does not support file preselection. Please pick magna_global_fullchain.pem manually.');
    mqttExplorerImportCaPem();
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return;
    }
    mqttExplorerSetStatus(err.message || 'Loading certificate failed.', true);
  }
};

window.mqttExplorerHandleCaPemFile = function(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  const lowerName = String(file.name || '').toLowerCase();
  if (!lowerName.endsWith('.pem')) {
    mqttExplorerSetStatus('Only .pem certificate files are allowed.', true);
    if (event?.target) {
      event.target.value = '';
    }
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    const caPemInput = document.getElementById('mqttCaPem');
    if (!caPemInput) {
      mqttExplorerSetStatus('CA PEM field not found.', true);
      return;
    }

    caPemInput.value = text;
    mqttExplorerSetStatus(`Certificate imported: ${file.name}`);
  };

  reader.onerror = () => {
    mqttExplorerSetStatus('Reading certificate file failed.', true);
  };

  reader.readAsText(file);
  if (event?.target) {
    event.target.value = '';
  }
};

window.mqttExplorerExportCaPem = function() {
  const caPem = String(document.getElementById('mqttCaPem')?.value || '');
  if (!caPem.trim()) {
    mqttExplorerSetStatus('CA PEM is empty. Nothing to export.', true);
    return;
  }

  const blob = new Blob([caPem], { type: 'application/x-pem-file;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'magna_global_fullchain.pem';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  mqttExplorerSetStatus('Certificate exported as magna_global_fullchain.pem');
};

let stations = [];
let lines = [];
let assignments = [];
let timeEvents = [];
let weekPlans = [];
let weekPlanSets = []; // { name: string, entries: array of weekPlans }
let shiftSchedules = [];
let shiftAssignmentRecords = [];
let shiftAssignmentsEditMode = false;
let stationsEditMode = false;
let linesEditMode = false;
let assignmentsEditMode = false;
let timeEventsEditMode = false;
let weekPlansEditMode = false;
let shiftSchedulesEditMode = false;

const THEME_STORAGE_KEY = 'fld-syncboard-theme';

function updateHeaderLogos(theme) {
  const leftLogo = document.querySelector('.logo-left');
  const rightLogo = document.querySelector('.logo-right');
  const isLight = theme === 'light';

  if (leftLogo) {
    leftLogo.setAttribute('src', isLight ? 'Magna_Logo_bright.png' : 'Magna_Logo.png');
  }
  if (rightLogo) {
    rightLogo.setAttribute('src', isLight ? 'Mafact_Logo_bright.png' : 'Mafact_Logo.png');
  }
}

function updateThemeToggleButton(theme) {
  const button = document.getElementById('themeToggleBtn');
  if (!button)
    return;
  const isLight = theme === 'light';
  button.textContent = isLight ? 'Dark' : 'Light';
  button.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
}

function applyTheme(theme) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', nextTheme);
  updateHeaderLogos(nextTheme);
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  updateThemeToggleButton(nextTheme);
}

function initTheme() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(storedTheme === 'light' ? 'light' : 'dark');
  const button = document.getElementById('themeToggleBtn');
  if (button) {
    button.onclick = () => {
      const current = document.body.getAttribute('data-theme') || 'dark';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    };
  }
}

function normalizeLineShapeType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'I-shape';

  const aliasMap = {
    i: 'I-shape',
    'i-shape': 'I-shape',
    l: 'L-shape',
    'l-shape': 'L-shape',
    u: 'U-shape',
    'u-shape': 'U-shape',
    o: 'O-shape',
    'o-shape': 'O-shape',
    s: 'S-shape',
    's-shape': 'S-shape',
    t: 'T-shape',
    't-shape': 'T-shape',
    cell: 'Cell-shape',
    'cell-shape': 'Cell-shape',
    // Legacy aliases mapped to fixed allowed values.
    ring: 'O-shape',
    'ring-shape': 'O-shape',
    other: 'I-shape',
    'other-shape': 'I-shape'
  };

  return aliasMap[raw] || 'I-shape';
}

function getLineShapePreview(shapeType) {
  const shape = normalizeLineShapeType(shapeType);
  const map = {
    'I-shape': '[----]',
    'L-shape': '[|- ]',
    'U-shape': '[|__|]',
    'O-shape': '[ () ]',
    'S-shape': '[~S~]',
    'T-shape': '[ -|- ]',
    'Cell-shape': '[#]'
  };
  return map[shape] || map['I-shape'];
}
// ----------- 1. Stations --------
function renderStations() {
    const table = document.getElementById('stationTable');
    if (!table)
        return;
    table.innerHTML = `
    <thead>
      <tr>
        <th>${tr('stationId')}</th>
        <th>${tr('description')}</th>
        <th>${tr('bottleneck')}</th>
        <th>${tr('lastStation')}</th>
        <th>${tr('cycleTime')}</th>
        <th>${tr('action')}</th>
      </tr>
    </thead>
    <tbody>
      ${stations.map((station, idx) => `
        <tr>
          <td>${stationsEditMode
        ? `<input class="form-control form-control-sm" value="${station.id}" onchange="updateStationField(${idx},'id',this.value)">`
        : station.id}</td>
          <td>${stationsEditMode
        ? `<input class="form-control form-control-sm" value="${station.description}" onchange="updateStationField(${idx},'description',this.value)">`
        : station.description}</td>
          <td style="text-align:center;">${stationsEditMode
        ? `<input type="checkbox" ${station.bottleneck ? 'checked' : ''} onchange="updateStationField(${idx},'bottleneck',this.checked)">`
        : (station.bottleneck ? tr('yesLabel') : tr('noLabel'))}</td>
          <td style="text-align:center;">${stationsEditMode
        ? `<input type="checkbox" ${station.lastStation ? 'checked' : ''} onchange="updateStationField(${idx},'lastStation',this.checked)">`
        : (station.lastStation ? tr('yesLabel') : tr('noLabel'))}</td>
          <td>${stationsEditMode
        ? `<input class="form-control form-control-sm" type="number" min="0" value="${station.cycleTime ?? ''}" onchange="updateStationField(${idx},'cycleTime',this.value === '' ? null : Number(this.value))">`
        : (station.cycleTime != null ? station.cycleTime : '')}</td>
          <td>
            ${stationsEditMode
          ? `<button class="btn btn-danger btn-sm" onclick="deleteStation('${station.id}')">${tr('deleteLabel')}</button>`
        : ""}
          </td>
        </tr>
      `).join("")}
      ${stationsEditMode ? `
      <tr>
        <td><input id="sId" type="text" class="form-control form-control-sm"></td>
        <td><input id="sDesc" type="text" class="form-control form-control-sm"></td>
        <td style="text-align:center;"><input id="sBottleneck" type="checkbox"></td>
        <td style="text-align:center;"><input id="sLastStation" type="checkbox"></td>
        <td><input id="sCycleTime" type="number" min="0" class="form-control form-control-sm"></td>
        <td><button class="btn btn-primary btn-sm" onclick="addStation()">${tr('addLabel')}</button></td>
      </tr>
      ` : ""}
    </tbody>
  `;
}
function addStation() {
    const id = document.getElementById("sId").value.trim();
    const desc = document.getElementById("sDesc").value.trim();
    const bottleneck = document.getElementById("sBottleneck").checked;
    const lastStation = document.getElementById("sLastStation").checked;
    const cycleTimeInput = document.getElementById("sCycleTime").value.trim();
    const cycleTime = cycleTimeInput === '' ? null : Number(cycleTimeInput);
    if (!id || !desc)
      return alert("ID and description required!");
    if (cycleTimeInput !== '' && Number.isNaN(cycleTime))
      return alert("Cycle time must be a valid number!");
    if (stations.some(s => s.id === id))
      return alert("Station ID already exists!");
    stations.push({ id, description: desc, bottleneck, lastStation, cycleTime });
    renderStations();
    document.getElementById("sId").value = "";
    document.getElementById("sDesc").value = "";
    document.getElementById("sBottleneck").checked = false;
    document.getElementById("sLastStation").checked = false;
    document.getElementById("sCycleTime").value = "";
}
function deleteStation(id) {
    stations = stations.filter(s => s.id !== id);
    renderStations();
}
function updateStationField(idx, field, value) {
    stations[idx][field] = value;
}
function showStations() { stationsEditMode = false; renderStations(); }
function editStations() { stationsEditMode = true; renderStations(); }
function saveStationsEdit() { stationsEditMode = false; renderStations(); }
function resetStations() {
    stations = [];
    stationsEditMode = true;
    renderStations();
}
window.addStation = addStation;
window.deleteStation = deleteStation;
window.updateStationField = updateStationField;
window.showStations = showStations;
window.editStations = editStations;
window.saveStationsEdit = saveStationsEdit;
window.resetStations = resetStations;
// ----------- 2. Lines --------
function renderLines() {
    const table = document.getElementById('lineTable');
    if (!table)
        return;
    table.innerHTML = `
    <thead>
      <tr>
        <th>${tr('lineId')}</th>
        <th>${tr('description')}</th>
        <th>${tr('lineShape')}</th>
        <th>${tr('visual')}</th>
        <th>${tr('action')}</th>
      </tr>
    </thead>
    <tbody>
      ${lines.map((line, idx) => `
        <tr>
          <td>${linesEditMode
        ? `<input class="form-control form-control-sm" value="${line.id}" onchange="updateLineField(${idx},'id',this.value)">`
        : line.id}</td>
          <td>${linesEditMode
        ? `<input class="form-control form-control-sm" value="${line.description}" onchange="updateLineField(${idx},'description',this.value)">`
        : line.description}</td>
          <td>${linesEditMode
        ? `<select class="form-select form-select-sm" onchange="updateLineField(${idx},'shapeType',this.value)">
                ${['I-shape','L-shape','U-shape','O-shape','S-shape','T-shape','Cell-shape'].map((shape) => `<option value="${shape}" ${(normalizeLineShapeType(line.shapeType) === shape) ? 'selected' : ''}>${shape}</option>`).join('')}
              </select>`
        : normalizeLineShapeType(line.shapeType)}</td>
          <td><span class="badge bg-secondary">${getLineShapePreview(line.shapeType)}</span></td>
          <td>
            ${linesEditMode
          ? `<button class="btn btn-danger btn-sm" onclick="deleteLine('${line.id}')">${tr('deleteLabel')}</button>`
        : ""}
          </td>
        </tr>
      `).join("")}
      ${linesEditMode ? `
      <tr>
        <td><input id="lId" type="text" class="form-control form-control-sm"></td>
        <td><input id="lDesc" type="text" class="form-control form-control-sm"></td>
        <td>
          <select id="lShape" class="form-select form-select-sm">
            ${['I-shape','L-shape','U-shape','O-shape','S-shape','T-shape','Cell-shape'].map((shape) => `<option value="${shape}">${shape}</option>`).join('')}
          </select>
        </td>
        <td><span class="badge bg-secondary">${getLineShapePreview('I-shape')}</span></td>
        <td><button class="btn btn-primary btn-sm" onclick="addLine()">${tr('addLabel')}</button></td>
      </tr>
      ` : ""}
    </tbody>
  `;
}
function addLine() {
    const id = document.getElementById("lId").value.trim();
    const desc = document.getElementById("lDesc").value.trim();
  const shapeType = normalizeLineShapeType(document.getElementById("lShape")?.value || 'I-shape');
    if (!id || !desc)
      return alert("ID and description required!");
    if (lines.some(l => l.id === id))
      return alert("Line ID already exists!");
    lines.push({ id, description: desc, shapeType });
    renderLines();
    document.getElementById("lId").value = "";
    document.getElementById("lDesc").value = "";
    if (document.getElementById("lShape")) {
      document.getElementById("lShape").value = 'I-shape';
    }
}
function deleteLine(id) {
    lines = lines.filter(l => l.id !== id);
    renderLines();
}
function updateLineField(idx, field, value) {
    lines[idx][field] = value;
}
window.addLine = addLine;
window.deleteLine = deleteLine;
window.updateLineField = updateLineField;
window.showLines = () => { linesEditMode = false; renderLines(); };
window.editLines = () => { linesEditMode = true; renderLines(); };
window.saveLinesEdit = () => { linesEditMode = false; renderLines(); };
window.resetLines = () => { lines = []; linesEditMode = true; renderLines(); };
// ----------- 3. Assignments --------
function renderAssignments() {
    const table = document.getElementById('assignTable');
    if (!table)
        return;
    table.innerHTML = `
    <thead>
      <tr>
        <th>${tr('lineSingular')}</th>
        <th>${tr('stationSingular')}</th>
        <th>${tr('action')}</th>
      </tr>
    </thead>
    <tbody>
      ${assignments.length === 0
        ? ''
        : assignments.map((a, idx) => `
        <tr>
          <td>${assignmentsEditMode
            ? `<select class="form-select form-select-sm" onchange="updateAssignmentField(${idx},'lineId',this.value)">
                ${lines.map(l => `<option value="${l.id}" ${a.lineId === l.id ? "selected" : ""}>${l.id}</option>`).join("")}
              </select>`
            : a.lineId}</td>
          <td>${assignmentsEditMode
            ? `<select class="form-select form-select-sm" onchange="updateAssignmentField(${idx},'stationId',this.value)">
                ${stations.map(s => `<option value="${s.id}" ${a.stationId === s.id ? "selected" : ""}>${s.id}</option>`).join("")}
              </select>`
            : a.stationId}</td>
          <td>
            ${assignmentsEditMode
            ? `<button class="btn btn-danger btn-sm" onclick="deleteAssignment(${idx})">${tr('deleteLabel')}</button>`
            : ""}
          </td>
        </tr>
      `).join("")}
      ${assignmentsEditMode
        ? `<tr>
        <td>
          <select id="aLine" class="form-select form-select-sm">
            ${lines.length === 0 ? `<option disabled selected>${tr('noLineAvailable')}</option>` : lines.map(l => `<option value="${l.id}">${l.id}</option>`).join("")}
          </select>
        </td>
        <td>
          <select id="aStation" class="form-select form-select-sm">
            ${stations.length === 0 ? `<option disabled selected>${tr('noStationAvailable')}</option>` : stations.map(s => `<option value="${s.id}">${s.id}</option>`).join("")}
          </select>
        </td>
        <td><button class="btn btn-primary btn-sm" onclick="addAssignment()">${tr('addLabel')}</button></td>
      </tr>`
        : ""}
    </tbody>
  `;
}
function addAssignment() {
    var _a, _b;
    const lineId = (_a = document.getElementById("aLine")) === null || _a === void 0 ? void 0 : _a.value;
    const stationId = (_b = document.getElementById("aStation")) === null || _b === void 0 ? void 0 : _b.value;
    if (!lineId || !stationId)
      return alert("Please select line and station!");
    if (assignments.some(a => a.lineId === lineId && a.stationId === stationId))
      return alert("This assignment already exists!");
    assignments.push({ lineId, stationId });
    renderAssignments();
}
function deleteAssignment(idx) {
    assignments.splice(idx, 1);
    renderAssignments();
}
function updateAssignmentField(idx, field, value) {
    assignments[idx][field] = value;
}
function showAssignments() {
  assignmentsEditMode = false;
  renderAssignmentsList();
}
function editAssignments() {
  assignmentsEditMode = true;
  openAssignDialog();
}
function saveAssignmentsEdit() {
  assignmentsEditMode = false;
  renderAssignmentsList();
}
function resetAssignments() {
    assignments = [];
    assignmentsEditMode = true;
  renderAssignmentsList();
}
window.addAssignment = addAssignment;
window.deleteAssignment = deleteAssignment;
window.updateAssignmentField = updateAssignmentField;
window.showAssignments = showAssignments;
window.editAssignments = editAssignments;
window.saveAssignmentsEdit = saveAssignmentsEdit;
window.resetAssignments = resetAssignments;
// ----------- 4. Time Events (minimal demo) --------
function renderTEs() {
    const table = document.getElementById('teTable');
    if (!table)
        return;
    table.innerHTML = `
    <thead>
      <tr>
        <th>${tr('idLabel')}</th>
        <th>${tr('description')}</th>
        <th>${tr('productiveLabel')}</th>
        <th>${tr('action')}</th>
      </tr>
    </thead>
    <tbody>
      ${timeEvents.map((te, idx) => `
        <tr>
          <td>${timeEventsEditMode
        ? `<input class="form-control form-control-sm" value="${te.id}" onchange="updateTEField(${idx},'id',this.value)">`
        : te.id}</td>
          <td>${timeEventsEditMode
        ? `<input class="form-control form-control-sm" value="${te.description}" onchange="updateTEField(${idx},'description',this.value)">`
        : te.description}</td>
          <td style="text-align:center;">
            ${timeEventsEditMode
              ? `<input type="checkbox" ${te.productive ? 'checked' : ''} onchange="updateTEField(${idx},'productive',this.checked?1:0)">`
              : (te.productive ? tr('yesLabel') : tr('noLabel'))}
          </td>
          <td>
            ${timeEventsEditMode
        ? `<button class="btn btn-danger btn-sm" onclick="deleteTE(${idx})">${tr('deleteLabel')}</button>`
        : ""}
          </td>
        </tr>
      `).join("")}
      ${timeEventsEditMode ? `
      <tr>
        <td><input id="teId" type="text" class="form-control form-control-sm"></td>
        <td><input id="teDesc" type="text" class="form-control form-control-sm"></td>
        <td style="text-align:center;"><input id="teProd" type="checkbox" checked></td>
        <td><button class="btn btn-primary btn-sm" onclick="addTE()">${tr('addLabel')}</button></td>
      </tr>
      ` : ""}
    </tbody>
  `;
}
function addTE() {
    const id = document.getElementById("teId").value.trim();
    const desc = document.getElementById("teDesc").value.trim();
    const prod = document.getElementById("teProd").checked ? 1 : 0;
    if (!id || !desc)
      return alert("ID and description required!");
    if (timeEvents.some(te => te.id === id))
      return alert("ID already exists!");
    timeEvents.push({ id, description: desc, productive: prod });
    renderTEs();
    document.getElementById("teId").value = "";
    document.getElementById("teDesc").value = "";
    document.getElementById("teProd").checked = true;
}
function deleteTE(idx) {
    timeEvents.splice(idx, 1);
    renderTEs();
}
function updateTEField(idx, field, value) {
    timeEvents[idx][field] = value;
}
function showTEs() { timeEventsEditMode = false; renderTEs(); }
function editTEs() { timeEventsEditMode = true; renderTEs(); }
function saveTEsEdit() { timeEventsEditMode = false; renderTEs(); }
function resetTEs() {
    timeEvents = [];
    timeEventsEditMode = true;
    renderTEs();
}
window.addTE = addTE;
window.deleteTE = deleteTE;
window.updateTEField = updateTEField;
window.showTEs = showTEs;
window.editTEs = editTEs;
window.saveTEsEdit = saveTEsEdit;
window.resetTEs = resetTEs;
// ----------- 5. Shift Modells --------
function getLocalizedWeekdayOptions() {
  return [
    tr('weekdayMonday'),
    tr('weekdayTuesday'),
    tr('weekdayWednesday'),
    tr('weekdayThursday'),
    tr('weekdayFriday'),
    tr('weekdaySaturday'),
    tr('weekdaySunday')
  ];
}

function buildWeekdaySelectOptions(selectedValue, withPlaceholder = false) {
  const selected = String(selectedValue || '').trim();
  const localized = getLocalizedWeekdayOptions();
  const values = [...localized];

  // Keep imported/stored day values selectable even if they are from another language or format.
  if (selected && !values.includes(selected)) {
    values.unshift(selected);
  }

  let html = withPlaceholder
    ? `<option value="">${tr('selectWeekday')}</option>`
    : '';

  html += values.map((value) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${value}</option>`).join('');
  return html;
}

function renderWPs() {
    const table = document.getElementById('wpTable');
    if (!table)
      return;
    const toHtmlAttr = (value) => String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const shiftNameSuggestions = Array.from(new Set(
      (timeEvents || [])
        .map((te) => String(te?.description || '').trim())
        .filter(Boolean)
    ));
    const shiftNameSuggestionsHtml = weekPlansEditMode
      ? `
      <datalist id="wpShiftSuggestions">
        ${shiftNameSuggestions.map((name) => `<option value="${toHtmlAttr(name)}"></option>`).join('')}
      </datalist>
    `
      : '';
    // Hole den Namen aus dem Input oder aus weekPlans, falls importiert
    let currentName = '';
    const nameInput = document.getElementById('wpSetName');
    if (nameInput && nameInput.value.trim()) {
      currentName = nameInput.value.trim();
    } else if (weekPlans.length > 0 && weekPlans[0].name && weekPlans[0].name.trim()) {
      currentName = weekPlans[0].name.trim();
      // Schreibe ihn ins Input, falls noch nicht gesetzt
      setTimeout(() => {
        const ni = document.getElementById('wpSetName');
        if (ni && ni.value.trim() !== currentName) ni.value = currentName;
      }, 0);
    }
    table.innerHTML = `
    ${shiftNameSuggestionsHtml}
    <caption>
      ${currentName ? `<div class='fw-bold fs-5 mb-1 themed-title'>${currentName}</div>` : ''}
      <div class="row g-2 align-items-center mb-2">
        <div class="col-auto">
          <input id="wpSetName" type="text" class="form-control form-control-sm${!currentName ? ' is-invalid' : ''}" placeholder="${tr('shiftModellNameRequired')}" oninput="this.classList.remove('is-invalid')" onkeydown="if(event.key==='Enter'){window.saveWeekPlanSet()}" onblur="window.saveWeekPlanSet()">
        </div>
      </div>
    </caption>
    <thead>
      <tr>
        <th>${tr('weekdayLabel')}</th>
        <th>${tr('shiftName')}</th>
        <th>${tr('start')}</th>
        <th>${tr('end')}</th>
        <th>${tr('duration')}</th>
        <th>${tr('productiveLabel')}</th>
        <th>${tr('timeEvent')}</th>
        <th>${tr('action')}</th>
      </tr>
    </thead>
    <tbody>
      ${weekPlans.map((wp, idx) => `
        <tr>
          <td>${weekPlansEditMode
            ? `<select class="form-select form-select-sm" onchange="updateWPField(${idx},'day',this.value)">
                ${buildWeekdaySelectOptions(wp.day)}
              </select>`
            : (wp.day || '')}</td>
          <td>${weekPlansEditMode
            ? `<input class="form-control form-control-sm" list="wpShiftSuggestions" value="${toHtmlAttr(wp.shift || '')}" onchange="updateWPField(${idx},'shift',this.value)">`
            : (wp.shift || '')}</td>
          <td>${weekPlansEditMode
            ? `<input class="form-control form-control-sm" type="time" value="${wp.start || ''}" onchange="updateWPField(${idx},'start',this.value)">`
            : (wp.start || '')}</td>
          <td>${weekPlansEditMode
            ? `<input class="form-control form-control-sm" type="time" value="${wp.end || ''}" onchange="updateWPField(${idx},'end',this.value)">`
            : (wp.end || '')}</td>
          <td>${weekPlansEditMode
            ? `<input class="form-control form-control-sm" value="${wp.duration || ''}" onchange="updateWPField(${idx},'duration',this.value)">`
            : (wp.duration || '')}</td>
          <td style="text-align:center;">
            ${weekPlansEditMode
              ? `<input type="checkbox" ${wp.productive ? 'checked' : ''} onchange="updateWPField(${idx},'productive',this.checked?1:0)">`
              : (wp.productive ? tr('yesLabel') : tr('noLabel'))}
          </td>
          <td>
            ${weekPlansEditMode
              ? `<select class="form-select form-select-sm" onchange="updateWPField(${idx},'timeevent',this.value)">`
                + `<option value=""></option>`
                + timeEvents.map(te => `<option value="${te.id}" ${wp.timeevent === te.id ? 'selected' : ''}>${te.id} - ${te.description}</option>`).join('')
                + `</select>`
              : (wp.timeevent ? wp.timeevent : '')}
          </td>
          <td>
            ${weekPlansEditMode
              ? `<button class="btn btn-danger btn-sm" onclick="deleteWP(${idx})">${tr('deleteLabel')}</button>`
              : ""}
          </td>
        </tr>
      `).join("")}
      ${weekPlansEditMode ? `
      <tr>
        <td>
          <select id="wpDay" class="form-select form-select-sm">
            ${buildWeekdaySelectOptions('', true)}
          </select>
        </td>
        <td><input id="wpShift" class="form-control form-control-sm" type="text" list="wpShiftSuggestions" placeholder="${tr('shiftNamePlaceholder')}"></td>
        <td><input id="wpStart" class="form-control form-control-sm" type="time" onchange="updateWPDurationPreview()"></td>
        <td><input id="wpEnd" class="form-control form-control-sm" type="time" onchange="updateWPDurationPreview()"></td>
        <td><input id="wpDuration" class="form-control form-control-sm" type="text" readonly></td>
        <td style="text-align:center;"><input id="wpProd" type="checkbox" checked></td>
        <td>
          <select id="wpTimeevent" class="form-select form-select-sm" onchange="applyTimeEventToWPForm()">
            <option value=""></option>
            ${timeEvents.map(te => `<option value="${te.id}">${te.id} - ${te.description}</option>`).join('')}
          </select>
        </td>
        <td><button class="btn btn-primary btn-sm" onclick="addWP()">${tr('addLabel')}</button></td>
      </tr>
      ` : ""}
    </tbody>
  `;
}

function updateWPDurationPreview() {
  const startEl = document.getElementById('wpStart');
  const endEl = document.getElementById('wpEnd');
  const durationEl = document.getElementById('wpDuration');
  if (!startEl || !endEl || !durationEl)
    return;

  const start = startEl.value;
  const end = endEl.value;
  if (!start || !end) {
    durationEl.value = '';
    return;
  }

  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0)
    mins += 24 * 60;
  durationEl.value = `${mins} ${tr('duration')}`;
}

function applyTimeEventToWPForm() {
  const teId = document.getElementById('wpTimeevent')?.value;
  if (!teId)
    return;
  const te = timeEvents.find((x) => x.id === teId);
  if (!te)
    return;

  const shiftEl = document.getElementById('wpShift');
  const prodEl = document.getElementById('wpProd');
  if (shiftEl && te.description)
    shiftEl.value = te.description;
  if (prodEl)
    prodEl.checked = !!te.productive;
}

window.saveWeekPlanSet = function() {
  const nameInput = document.getElementById('wpSetName');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!nameInput || !name) {
    if (nameInput)
      nameInput.classList.add('is-invalid');
    return;
  }
  if (weekPlans.length === 0)
    return;

  nameInput.classList.remove('is-invalid');
  const idx = weekPlanSets.findIndex((wps) => wps.name === name);
  if (idx >= 0) {
    weekPlanSets[idx].entries = JSON.parse(JSON.stringify(weekPlans));
  } else {
    weekPlanSets.push({ name, entries: JSON.parse(JSON.stringify(weekPlans)) });
  }

  renderWPs();
  populateAssignShiftScheduleUI();
  setTimeout(() => {
    const el = document.getElementById('wpSetName');
    if (el)
      el.value = name;
  }, 0);
};

window.loadWeekPlanSet = function() {
  const sel = document.getElementById('wpSetSelect');
  const idx = sel && sel.value ? parseInt(sel.value) : null;
  if (idx == null || isNaN(idx) || !weekPlanSets[idx])
    return;
  weekPlans = JSON.parse(JSON.stringify(weekPlanSets[idx].entries));
  weekPlansEditMode = true;
  renderWPs();
};

function addWP() {
    // Name immer aus globalem Namensfeld holen
    const nameInput = document.getElementById("wpSetName");
    const name = nameInput ? nameInput.value.trim() : "";
    const day = document.getElementById("wpDay").value.trim();
    const start = document.getElementById("wpStart").value;
    const end = document.getElementById("wpEnd").value;
    const timeevent = document.getElementById("wpTimeevent").value;
    let shift = document.getElementById("wpShift").value.trim();
    // Name aus Timeevent übernehmen, falls gewählt
    if (timeevent) {
      const te = timeEvents.find(te => te.id === timeevent);
      if (te && te.description) shift = te.description;
    }
    // Dauer automatisch berechnen (in Minuten)
    let duration = "";
    if (start && end) {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      let mins = (eh * 60 + em) - (sh * 60 + sm);
      if (mins < 0) mins += 24 * 60;
      duration = `${mins} ${tr('duration')}`;
    }
    let prod;
    if (timeevent) {
      const te = timeEvents.find(te => te.id === timeevent);
      prod = te && typeof te.productive !== 'undefined' ? te.productive : 1;
    } else {
      prod = document.getElementById("wpProd").checked ? 1 : 0;
    }
    if (!name) {
      if (nameInput)
        nameInput.classList.add('is-invalid');
      return alert("Shift Modell Name required!");
    }
    if (!day || !shift || !start || !end)
      return alert("All fields required!");
    weekPlans.push({ name, day, shift, start, end, duration, productive: prod, timeevent });
    window.saveWeekPlanSet();
    renderWPs();
    document.getElementById("wpDay").value = "";
    document.getElementById("wpShift").value = "";
    document.getElementById("wpStart").value = "";
    document.getElementById("wpEnd").value = "";
    document.getElementById("wpDuration").value = "";
    document.getElementById("wpProd").checked = true;
    document.getElementById("wpTimeevent").value = "";
}
function deleteWP(idx) {
    weekPlans.splice(idx, 1);
    renderWPs();
}
function updateWPField(idx, field, value) {
    weekPlans[idx][field] = value;
}
function showWPs() { weekPlansEditMode = false; renderWPs(); }
function editWPs() { weekPlansEditMode = true; renderWPs(); }
function saveWPsEdit() {
    const nameInput = document.getElementById('wpSetName');
    const modelName = nameInput ? nameInput.value.trim() : '';
    if (weekPlans.length === 0) {
      weekPlansEditMode = false;
      renderWPs();
      return;
    }

    if (!modelName) {
      if (nameInput)
        nameInput.classList.add('is-invalid');
      alert('Please provide a Shift Modell Name.');
      return;
    }

    window.saveWeekPlanSet();
    weekPlansEditMode = false;
    renderWPs();
    alert('Shift Modell saved successfully.');
}
function resetWPs() {
    const existingName = (document.getElementById('wpSetName')?.value || '').trim();
    weekPlans = [];
    weekPlansEditMode = true;
    renderWPs();
    setTimeout(() => {
      const nameInput = document.getElementById('wpSetName');
      if (nameInput) {
        nameInput.value = existingName;
        if (existingName)
          nameInput.classList.remove('is-invalid');
        else
          nameInput.classList.add('is-invalid');
      }
      const titleDiv = nameInput && nameInput.closest('caption').querySelector('.fw-bold');
      if (titleDiv) titleDiv.textContent = existingName;
      // Clear all input fields for new weekplan
      const fields = ['wpDay','wpShift','wpStart','wpEnd','wpDuration','wpProd','wpTimeevent'];
      fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          if (el.type === 'checkbox') el.checked = true;
          else el.value = '';
        }
      });
    }, 0);
}
window.addWP = addWP;
window.deleteWP = deleteWP;
window.updateWPField = updateWPField;
window.showWPs = showWPs;
window.editWPs = editWPs;
window.saveWPsEdit = saveWPsEdit;
window.resetWPs = resetWPs;
window.updateWPDurationPreview = updateWPDurationPreview;
window.applyTimeEventToWPForm = applyTimeEventToWPForm;
// ----------- 6. Shift Schedules (minimal demo) --------
function renderSSs() {
    const table = document.getElementById('ssTable');
    if (!table)
        return;
    table.innerHTML = `
    <thead>
      <tr>
        <th>ID</th>
        <th>Description</th>
        <th>Action</th>
      </tr>
    </thead>
    <tbody>
      ${shiftSchedules.map((ss, idx) => `
        <tr>
          <td>${shiftSchedulesEditMode
        ? `<input class="form-control form-control-sm" value="${ss.id}" onchange="updateSSField(${idx},'id',this.value)">`
        : ss.id}</td>
          <td>${shiftSchedulesEditMode
        ? `<input class="form-control form-control-sm" value="${ss.description}" onchange="updateSSField(${idx},'description',this.value)">`
        : ss.description}</td>
          <td>
            ${shiftSchedulesEditMode
        ? `<button class="btn btn-danger btn-sm" onclick="deleteSS(${idx})">Delete</button>`
        : ""}
          </td>
        </tr>
      `).join("")}
      ${shiftSchedulesEditMode ? `
      <tr>
        <td>
          <input id="ssId" type="text" class="form-control form-control-sm">
        </td>
        <td>
          <input id="ssDesc" type="text" class="form-control form-control-sm">
          <select id="ssWeekplanSelect" class="form-select form-select-sm mt-1" onchange="window.setSSFromWeekplan && window.setSSFromWeekplan()">
            <option value="">-- Select weekplan --</option>
            ${weekPlanSets.map((wps, idx) => `<option value="${idx}">${wps.name}</option>`).join('')}
          </select>
        </td>
        <td><button class="btn btn-primary btn-sm" onclick="addSS()">Add</button></td>
      </tr>
      ` : ""}
    </tbody>
  `;
}
// Copy values from the selected weekplan into shift schedule inputs
window.setSSFromWeekplan = function() {
  var sel = document.getElementById('ssWeekplanSelect');
  var idx = sel && sel.value ? parseInt(sel.value) : null;
  if (idx == null || isNaN(idx) || !weekPlanSets[idx]) return;
  var wps = weekPlanSets[idx];
  // Prefill name and summary description
  document.getElementById('ssId').value = wps.name;
  let desc = wps.entries.map(wp => `${wp.shift} (${wp.start}-${wp.end}, ${wp.duration})`).join('; ');
  document.getElementById('ssDesc').value = desc;
};
function addSS() {
    const id = document.getElementById("ssId").value.trim();
    const desc = document.getElementById("ssDesc").value.trim();
    if (!id || !desc)
      return alert("ID and description required!");
    if (shiftSchedules.some(ss => ss.id === id))
      return alert("ID already exists!");
    shiftSchedules.push({ id, description: desc });
    renderSSs();
    document.getElementById("ssId").value = "";
    document.getElementById("ssDesc").value = "";
}
function deleteSS(idx) {
    shiftSchedules.splice(idx, 1);
    renderSSs();
}
function updateSSField(idx, field, value) {
    shiftSchedules[idx][field] = value;
}
function showSSs() { shiftSchedulesEditMode = false; renderSSs(); }
function editSSs() { shiftSchedulesEditMode = true; renderSSs(); }
function saveSSsEdit() { shiftSchedulesEditMode = false; renderSSs(); }
function resetSSs() {
    shiftSchedules = [];
    shiftSchedulesEditMode = true;
    renderSSs();
}
window.addSS = addSS;
window.deleteSS = deleteSS;
window.updateSSField = updateSSField;
window.showSSs = showSSs;
window.editSSs = editSSs;
window.saveSSsEdit = saveSSsEdit;
window.resetSSs = resetSSs;
// ----------- Export Excel --------
function exportExcel(type) {
    let data = [];
    let filename = "";
    if (type === "stations") {
        data = stations.map(s => ({
          "Station ID": s.id,
          "Description": s.description,
          "Bottleneck": s.bottleneck ? 1 : 0,
          "Cycle Time (s)": s.cycleTime != null ? Number(s.cycleTime) : ''
        }));
        filename = "stations.xlsx";
    }
    else if (type === "lines") {
        data = lines.map(l => ({ "Line ID": l.id, "Description": l.description }));
        filename = "lines.xlsx";
    }
    else if (type === "assignments") {
        data = assignments.map(a => ({ "Line": a.lineId, "Station": a.stationId }));
        filename = "assignments.xlsx";
    }
    else if (type === "timeEvents") {
      data = timeEvents.map(te => ({ "ID": te.id, "Description": te.description, "Productive": te.productive ? 1 : 0 }));
      filename = "timeEvents.xlsx";
    }
    else if (type === "weekPlans") {
        // Export all saved Shift Modells (weekPlanSets) as separate sheets
        if (!Array.isArray(weekPlanSets) || weekPlanSets.length === 0) {
          alert('No Shift Modells to export!');
          return;
        }
        const wb = XLSX.utils.book_new();
        let anyData = false;
        weekPlanSets.forEach((modell) => {
          if (!modell || !modell.name || !Array.isArray(modell.entries) || modell.entries.length === 0) return;
          let sheetData = [];
          sheetData.push({ "Weekday": `Shift Modell Name: ${modell.name}` });
          sheetData = sheetData.concat(modell.entries.map(wp => ({
            "Weekday": wp.day,
            "Shift Name": wp.shift,
            "Start": wp.start,
            "End": wp.end,
            "Duration": wp.duration,
            "Productive": wp.productive ? 1 : 0
          })));
          const ws = XLSX.utils.json_to_sheet(sheetData);
          XLSX.utils.book_append_sheet(wb, ws, modell.name.substring(0, 31));
          anyData = true;
        });
        if (!anyData) {
          alert('No Shift Modells with entries to export!');
          return;
        }
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        saveAs(new Blob([wbout], { type: "application/octet-stream" }), "shift-modells.xlsx");
        return;
    }
    else if (type === "shiftSchedules") {
        if (!Array.isArray(shiftAssignmentRecords) || shiftAssignmentRecords.length === 0) {
          alert("No shift assignments to export!");
          return;
        }
        data = shiftAssignmentRecords.map((r) => ({
          "Shift Modell": r.modellName,
          "Shift ID": r.shiftId,
          "Day": r.day,
          "Shift": r.shift,
          "Start": r.start,
          "End": r.end,
          "Duration": r.duration,
          "Target Type": r.targetType,
          "Target ID": r.targetId,
          "Target Label": r.targetLabel || ''
        }));
        filename = "shiftAssignments.xlsx";
    }
    else {
      alert("Unknown export type!");
      return;
    }
    if (data.length === 0) {
      alert("No data to export!");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), filename);
}
// Funktion global machen:
window.exportExcel = exportExcel;

function setMasterdataTemplateStatus(message, isError = false) {
  const el = document.getElementById('masterdataTemplateStatus');
  if (!el) return;
  el.style.color = isError ? 'var(--accent-red)' : 'var(--accent-grey)';
  el.textContent = message || '';
}

function hasAnyMasterdata() {
  return (
    (stations || []).length > 0 ||
    (lines || []).length > 0 ||
    (assignments || []).length > 0 ||
    (timeEvents || []).length > 0 ||
    (weekPlanSets || []).length > 0 ||
    (shiftAssignmentRecords || []).length > 0
  );
}

function createSampleMasterdataSnapshot() {
  const sampleLines = [
    { id: 'LN-A', description: 'Linie A Rohbau Hauptfluss' },
    { id: 'LN-B', description: 'Linie B Rohbau Varianten' },
    { id: 'LN-C', description: 'Linie C Lackierung Karosse' },
    { id: 'LN-D', description: 'Linie D Lackierung Finish' },
    { id: 'LN-E', description: 'Linie E Endmontage Verbrenner' },
    { id: 'LN-F', description: 'Linie F Endmontage E-Mobilitaet' }
  ];

  const stationSteps = [
    'Wareneingang',
    'Vormontage',
    'Fertigung Zelle 1',
    'Fertigung Zelle 2',
    'Qualitaetspruefung Inline',
    'Nacharbeit',
    'Endpruefung',
    'Versandbereitstellung'
  ];

  const sampleStations = [];
  const sampleAssignments = [];

  sampleLines.forEach((line, lineIndex) => {
    stationSteps.forEach((step, stepIndex) => {
      const stationNo = (lineIndex + 1) * 100 + (stepIndex + 1) * 10;
      const stationId = `ST${stationNo}`;
      const cycleTime = 48 + lineIndex * 3 + stepIndex * 2;
      const isBottleneck = stepIndex === 2 || stepIndex === 6;
      const station = {
        id: stationId,
        description: `${line.id} ${step}`,
        bottleneck: isBottleneck ? 1 : 0,
        cycleTime
      };

      sampleStations.push(station);
      sampleAssignments.push({ lineId: line.id, stationId });
    });
  });

  const sampleShiftNames = {
    shift1: 'Schicht-1',
    shift2: 'Schicht-2',
    shiftA: 'Schicht-A',
    shiftB: 'Schicht-B',
    shiftC: 'Schicht-C',
    weekend1: 'Sonder-Schicht-1',
    weekend2: 'Sonder-Schicht-2'
  };

  const sampleTimeEvents = [
    { id: 'SH1', description: sampleShiftNames.shift1, productive: 1 },
    { id: 'SH2', description: sampleShiftNames.shift2, productive: 1 },
    { id: 'SHA', description: sampleShiftNames.shiftA, productive: 1 },
    { id: 'SHB', description: sampleShiftNames.shiftB, productive: 1 },
    { id: 'SHC', description: sampleShiftNames.shiftC, productive: 1 },
    { id: 'SS1', description: sampleShiftNames.weekend1, productive: 1 },
    { id: 'SS2', description: sampleShiftNames.weekend2, productive: 1 },
    { id: 'RUN', description: 'Regular Production', productive: 1 },
    { id: 'QPR', description: 'In-Process Quality Check', productive: 1 },
    { id: 'RST', description: 'Setup and Changeover', productive: 0 },
    { id: 'PAU', description: 'Planned Break', productive: 0 },
    { id: 'MEE', description: 'Team Meeting', productive: 0 },
    { id: 'MAT', description: 'Material Shortage Hold', productive: 0 },
    { id: 'MNT', description: 'Planned Maintenance', productive: 0 },
    { id: 'STO', description: 'Unplanned Repair', productive: 0 },
    { id: 'CLN', description: 'Cleaning and 5S', productive: 0 },
    { id: 'STD', description: 'Line Startup Delay', productive: 0 },
    { id: 'SCH', description: 'Line Shutdown and Handover', productive: 0 },
    { id: 'LOG', description: 'Internal Logistics Delay', productive: 0 },
    { id: 'ITS', description: 'IT System Outage', productive: 0 },
    { id: 'SAFE', description: 'Safety Stop', productive: 0 }
  ];

  function buildEntries(modelName, days, shifts, timeevent) {
    const entries = [];
    days.forEach((day) => {
      shifts.forEach((shiftDef) => {
        entries.push({
          name: modelName,
          day,
          shift: shiftDef.name,
          start: shiftDef.start,
          end: shiftDef.end,
          duration: shiftDef.duration,
          productive: 1,
          timeevent
        });
      });
    });
    return entries;
  }

  const daysMoFr = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
  const daysMoSa = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const daysWeekend = ['Sa', 'So'];

  const shift2WeekEntries = buildEntries(
    '2-Schicht Standard Werk',
    daysMoFr,
    [
      { name: sampleShiftNames.shift1, start: '06:00', end: '14:00', duration: '480 min' },
      { name: sampleShiftNames.shift2, start: '14:00', end: '22:00', duration: '480 min' }
    ],
    'RUN'
  );

  const shift3WeekEntries = buildEntries(
    '3-Schicht Vollauslastung',
    daysMoSa,
    [
      { name: sampleShiftNames.shiftA, start: '05:30', end: '13:30', duration: '480 min' },
      { name: sampleShiftNames.shiftB, start: '13:30', end: '21:30', duration: '480 min' },
      { name: sampleShiftNames.shiftC, start: '21:30', end: '05:30', duration: '480 min' }
    ],
    'RUN'
  );

  const weekendEntries = buildEntries(
    'Wochenende Sonderlauf',
    daysWeekend,
    [
      { name: sampleShiftNames.weekend1, start: '06:00', end: '14:00', duration: '480 min' },
      { name: sampleShiftNames.weekend2, start: '14:00', end: '22:00', duration: '480 min' }
    ],
    'QPR'
  );

  const sampleWeekPlanSets = [
    { name: '2-Schicht Standard Werk', entries: shift2WeekEntries },
    { name: '3-Schicht Vollauslastung', entries: shift3WeekEntries },
    { name: 'Wochenende Sonderlauf', entries: weekendEntries }
  ];

  function toShiftId(modelName, day, shift) {
    return `${modelName}_${day}_${shift}`.replace(/\s+/g, '_');
  }

  const sampleShiftAssignments = [];

  sampleLines.forEach((line, idx) => {
    daysMoFr.forEach((day) => {
      [sampleShiftNames.shift1, sampleShiftNames.shift2].forEach((shiftName) => {
        const modelName = '2-Schicht Standard Werk';
        sampleShiftAssignments.push({
          modellName: modelName,
          shiftId: toShiftId(modelName, day, shiftName),
          day,
          shift: shiftName,
          start: shiftName === sampleShiftNames.shift1 ? '06:00' : '14:00',
          end: shiftName === sampleShiftNames.shift1 ? '14:00' : '22:00',
          duration: '480 min',
          targetType: 'line',
          targetId: line.id,
          targetLabel: line.description
        });
      });
    });

    const bottleneckStation = sampleStations.find((s) => s.id === `ST${(idx + 1) * 100 + 30}`);
    const finalStation = sampleStations.find((s) => s.id === `ST${(idx + 1) * 100 + 70}`);

    if (bottleneckStation) {
      ['Mo', 'Mi', 'Fr'].forEach((day) => {
        const modelName = '3-Schicht Vollauslastung';
        sampleShiftAssignments.push({
          modellName: modelName,
          shiftId: toShiftId(modelName, day, sampleShiftNames.shiftB),
          day,
          shift: sampleShiftNames.shiftB,
          start: '13:30',
          end: '21:30',
          duration: '480 min',
          targetType: 'station',
          targetId: bottleneckStation.id,
          targetLabel: bottleneckStation.description
        });
      });
    }

    if (finalStation) {
      ['Sa', 'So'].forEach((day) => {
        const modelName = 'Wochenende Sonderlauf';
        sampleShiftAssignments.push({
          modellName: modelName,
          shiftId: toShiftId(modelName, day, sampleShiftNames.weekend1),
          day,
          shift: sampleShiftNames.weekend1,
          start: '06:00',
          end: '14:00',
          duration: '480 min',
          targetType: 'station',
          targetId: finalStation.id,
          targetLabel: finalStation.description
        });
      });
    }
  });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    stations: sampleStations,
    lines: sampleLines,
    assignments: sampleAssignments,
    timeEvents: sampleTimeEvents,
    weekPlanSets: sampleWeekPlanSets,
    shiftAssignments: sampleShiftAssignments
  };
}

function fillWithSampleMasterdata(force = false) {
  if (!force && hasAnyMasterdata()) return false;
  applyMasterdataSnapshot(createSampleMasterdataSnapshot());
  setMasterdataTemplateStatus(tr('sampleDataLoaded'));
  return true;
}

function upsertByKey(existingRows, incomingRows, keySelector) {
  const map = new Map();
  (Array.isArray(existingRows) ? existingRows : []).forEach((row) => {
    const key = keySelector(row);
    if (key) map.set(key, row);
  });
  (Array.isArray(incomingRows) ? incomingRows : []).forEach((row) => {
    const key = keySelector(row);
    if (key) map.set(key, row);
  });
  return Array.from(map.values());
}

function syncCurrentTemplateSnapshot(sectionLabel) {
  const catalog = document.getElementById('masterdataTemplateCatalog');
  const selected = catalog?.selectedOptions?.[0];
  const templateInput = document.getElementById('masterdataTemplateName');
  let templateName = String(selected?.dataset?.templateName || templateInput?.value || '').trim();
  const plant = String(document.getElementById('masterdataPlant')?.value || 'PLANT_XXX').trim() || 'PLANT_XXX';

  if (!templateName) {
    templateName = `AutoMerge_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    if (templateInput) templateInput.value = templateName;
  }

  fetchJsonWithFriendlyErrors('/api/masterdata-template', 'Template sync failed after section import.', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plant,
      templateName,
      payload: buildMasterdataSnapshot()
    })
  })
    .then(() => {
      if (typeof loadMasterdataCatalog === 'function') {
        loadMasterdataCatalog().then(() => {
          const refreshedCatalog = document.getElementById('masterdataTemplateCatalog');
          if (refreshedCatalog && refreshedCatalog.options.length) {
            const autoMatch = Array.from(refreshedCatalog.options).find((opt) => String(opt.dataset?.templateName || '').trim() === templateName);
            if (autoMatch) refreshedCatalog.value = autoMatch.value;
          }
        }).finally(() => {
          setMasterdataTemplateStatus(`${sectionLabel} ${tr('templateSyncDone')}`);
        });
        return;
      }
      setMasterdataTemplateStatus(`${sectionLabel} ${tr('templateSyncDone')}`);
    })
    .catch(() => {
      setMasterdataTemplateStatus(`${sectionLabel} ${tr('templateSyncSkipped')}`);
    });
}

function normalizeExcelTimeValue(raw) {
  if (raw == null || raw === '') return '';

  const toHm = (fraction) => {
    const minutesOfDay = Math.round((fraction % 1) * 24 * 60);
    const h = Math.floor(minutesOfDay / 60) % 24;
    const m = minutesOfDay % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw < 1) {
    return toHm(raw);
  }

  const text = String(raw).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const parsed = Number(text);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed < 1) {
      return toHm(parsed);
    }
  }

  return text;
}

function buildMasterdataSnapshot() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    stations: JSON.parse(JSON.stringify(stations || [])),
    lines: JSON.parse(JSON.stringify(lines || [])),
    assignments: JSON.parse(JSON.stringify(assignments || [])),
    timeEvents: JSON.parse(JSON.stringify(timeEvents || [])),
    weekPlanSets: JSON.parse(JSON.stringify(weekPlanSets || [])),
    shiftAssignments: JSON.parse(JSON.stringify(shiftAssignmentRecords || []))
  };
}

function applyMasterdataSnapshot(snapshot) {
  stations = Array.isArray(snapshot?.stations)
    ? snapshot.stations.map((station) => ({
      ...station,
      bottleneck: station?.bottleneck === true || station?.bottleneck === 1 || String(station?.bottleneck || '').toLowerCase() === 'true' || String(station?.bottleneck || '') === '1',
      lastStation: station?.lastStation === true || station?.lastStation === 1 || String(station?.lastStation || '').toLowerCase() === 'true' || String(station?.lastStation || '') === '1',
      cycleTime: station?.cycleTime == null || station?.cycleTime === '' ? null : Number(station.cycleTime)
    }))
    : [];
  lines = Array.isArray(snapshot?.lines)
    ? snapshot.lines.map((line) => ({
      ...line,
      shapeType: normalizeLineShapeType(line?.shapeType)
    }))
    : [];
  assignments = Array.isArray(snapshot?.assignments) ? snapshot.assignments : [];
  timeEvents = Array.isArray(snapshot?.timeEvents) ? snapshot.timeEvents : [];
  weekPlanSets = Array.isArray(snapshot?.weekPlanSets) ? snapshot.weekPlanSets : [];
  shiftAssignmentRecords = Array.isArray(snapshot?.shiftAssignments) ? snapshot.shiftAssignments : [];

  if (weekPlanSets.length > 0 && Array.isArray(weekPlanSets[0].entries)) {
    weekPlans = JSON.parse(JSON.stringify(weekPlanSets[0].entries));
  } else {
    weekPlans = [];
  }

  renderStations();
  renderLines();
  renderAssignmentsList();
  renderTEs();
  renderWPs();
  renderAssignedShiftSchedules();
  populateAssignShiftScheduleUI();
  applyLanguage();
}

function exportAllMasterdataExcel() {
  const wb = XLSX.utils.book_new();

  const metadataRows = [{
    Scope: 'PlantXtotal',
    Version: 1,
    ExportedAt: new Date().toISOString(),
    Includes: 'stations, lines, assignments, bottleneck, cycleTime, timeEvents, weekPlanSets, shiftAssignments'
  }];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metadataRows), 'plantXtotal');

  const stationsRows = (stations || []).map((s) => ({
    'Station ID': s.id,
    'Description': s.description,
    'Bottleneck': s.bottleneck ? 1 : 0,
    'Last Station': s.lastStation ? 1 : 0,
    'Cycle Time (s)': s.cycleTime != null ? Number(s.cycleTime) : ''
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stationsRows), 'stations');

  const linesRows = (lines || []).map((l) => ({
    'Line ID': l.id,
    'Description': l.description,
    'Shape Type': normalizeLineShapeType(l.shapeType)
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linesRows), 'lines');

  const assignmentsRows = (assignments || []).map((a) => ({
    'Line': a.lineId,
    'Station': a.stationId
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(assignmentsRows), 'assignments');

  const timeEventRows = (timeEvents || []).map((te) => ({
    'ID': te.id,
    'Description': te.description,
    'Productive': te.productive ? 1 : 0
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(timeEventRows), 'timeEvents');

  const weekPlanRows = [];
  (weekPlanSets || []).forEach((set) => {
    const setName = String(set?.name || '').trim();
    if (!setName || !Array.isArray(set.entries)) return;
    set.entries.forEach((entry) => {
      weekPlanRows.push({
        'Model Name': setName,
        'Weekday': entry.day || '',
        'Shift Name': entry.shift || '',
        'Start': entry.start || '',
        'End': entry.end || '',
        'Duration': entry.duration || '',
        'Productive': entry.productive ? 1 : 0,
        'Time Event': entry.timeevent || ''
      });
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weekPlanRows), 'weekPlanSets');

  const shiftAssignmentRows = (shiftAssignmentRecords || []).map((r) => ({
    'Shift Modell': r.modellName || '',
    'Shift ID': r.shiftId || '',
    'Day': r.day || '',
    'Shift': r.shift || '',
    'Start': r.start || '',
    'End': r.end || '',
    'Duration': r.duration || '',
    'Target Type': r.targetType || '',
    'Target ID': r.targetId || '',
    'Target Label': r.targetLabel || ''
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shiftAssignmentRows), 'shiftAssignments');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([wbout], { type: 'application/octet-stream' }), 'PlantXtotal-masterdata.xlsx');
}

function importAllMasterdataExcel(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });

    const getSheet = (names) => {
      const map = new Map(workbook.SheetNames.map((n) => [String(n || '').toLowerCase(), n]));
      for (const name of names) {
        const found = map.get(String(name || '').toLowerCase());
        if (found) return workbook.Sheets[found];
      }
      return null;
    };

    const readRows = (sheet) => sheet ? XLSX.utils.sheet_to_json(sheet) : [];

    const stationRows = readRows(getSheet(['stations', 'plantxtotal_stations', 'plantxtotal-stations']));
    const lineRows = readRows(getSheet(['lines', 'plantxtotal_lines', 'plantxtotal-lines']));
    const assignmentRows = readRows(getSheet(['assignments', 'plantxtotal_assignments', 'plantxtotal-assignments']));
    const teRows = readRows(getSheet(['timeevents', 'timeEvents', 'plantxtotal_timeevents', 'plantxtotal-timeevents']));
    const wpRows = readRows(getSheet(['weekplansets', 'weekPlanSets', 'weekplans', 'plantxtotal_weekplansets', 'plantxtotal-weekplansets']));
    const ssRows = readRows(getSheet(['shiftassignments', 'shiftAssignments', 'shiftschedules', 'plantxtotal_shiftassignments', 'plantxtotal-shiftassignments']));

    const nextSnapshot = {
      stations: stationRows.map((row) => {
        const bottleneckRaw = row['Bottleneck'] ?? row['bottleneck'];
        const lastStationRaw = row['Last Station'] ?? row['lastStation'];
        const cycleTimeRaw = row['Cycle Time (s)'] ?? row['Cycle Time'] ?? row['cycleTime'];
        const parsedCycleTime = cycleTimeRaw === '' || cycleTimeRaw == null ? null : Number(cycleTimeRaw);
        return {
          id: row['Station ID'] || row['id'] || '',
          description: row['Description'] || row['description'] || '',
          bottleneck: bottleneckRaw === true || bottleneckRaw === 1 || bottleneckRaw === '1' || String(bottleneckRaw || '').toLowerCase() === 'true',
          lastStation: lastStationRaw === true || lastStationRaw === 1 || lastStationRaw === '1' || String(lastStationRaw || '').toLowerCase() === 'true',
          cycleTime: Number.isNaN(parsedCycleTime) ? null : parsedCycleTime
        };
      }).filter((s) => String(s.id || '').trim()),

      lines: lineRows.map((row) => ({
        id: row['Line ID'] || row['id'] || '',
        description: row['Description'] || row['description'] || '',
        shapeType: normalizeLineShapeType(row['Shape Type'] || row['shapeType'] || row['shape'] || 'I-shape')
      })).filter((l) => String(l.id || '').trim()),

      assignments: assignmentRows.map((row) => ({
        lineId: row['Line'] || row['lineId'] || '',
        stationId: row['Station'] || row['stationId'] || ''
      })).filter((a) => String(a.lineId || '').trim() && String(a.stationId || '').trim()),

      timeEvents: teRows.map((row) => ({
        id: row['ID'] || row['id'] || '',
        description: row['Description'] || row['description'] || '',
        productive: (typeof row['Productive'] !== 'undefined') ? (row['Productive'] == 1 || row['Productive'] === true || row['Productive'] === '1' ? 1 : 0) : 1
      })).filter((te) => String(te.id || '').trim()),

      weekPlanSets: [],
      shiftAssignments: ssRows.map((row) => ({
        modellName: String(row['Shift Modell'] || row['Shift Model'] || row['modellName'] || '').trim(),
        shiftId: String(row['Shift ID'] || row['shiftId'] || '').trim(),
        day: String(row['Day'] || row['Weekday'] || row['day'] || '').trim(),
        shift: String(row['Shift'] || row['Shift Name'] || row['shift'] || '').trim(),
        start: normalizeExcelTimeValue(row['Start'] ?? row['start']),
        end: normalizeExcelTimeValue(row['End'] ?? row['end']),
        duration: String(row['Duration'] || row['duration'] || '').trim(),
        targetType: String(row['Target Type'] || row['targetType'] || '').trim().toLowerCase(),
        targetId: String(row['Target ID'] || row['targetId'] || '').trim(),
        targetLabel: String(row['Target Label'] || row['targetLabel'] || '').trim()
      })).filter((r) => String(r.targetId || '').trim())
    };

    const modelMap = new Map();
    wpRows.forEach((row) => {
      const modelName = String(row['Model Name'] || row['Shift Modell'] || row['Shift Model'] || row['modelName'] || '').trim();
      if (!modelName) return;
      if (!modelMap.has(modelName)) modelMap.set(modelName, []);
      modelMap.get(modelName).push({
        name: modelName,
        day: String(row['Weekday'] || row['Day'] || row['day'] || '').trim(),
        shift: String(row['Shift Name'] || row['Shift'] || row['shift'] || '').trim(),
        start: normalizeExcelTimeValue(row['Start'] ?? row['start']),
        end: normalizeExcelTimeValue(row['End'] ?? row['end']),
        duration: String(row['Duration'] || row['duration'] || '').trim(),
        productive: (typeof row['Productive'] !== 'undefined') ? (row['Productive'] == 1 || row['Productive'] === true || row['Productive'] === '1' ? 1 : 0) : 1,
        timeevent: String(row['Time Event'] || row['timeevent'] || '').trim()
      });
    });
    nextSnapshot.weekPlanSets = Array.from(modelMap.entries()).map(([name, entries]) => ({ name, entries }));

    applyMasterdataSnapshot(nextSnapshot);
    alert(`PlantXtotal import completed. Stations=${nextSnapshot.stations.length}, Lines=${nextSnapshot.lines.length}, Assignments=${nextSnapshot.assignments.length}, TimeEvents=${nextSnapshot.timeEvents.length}, ShiftModels=${nextSnapshot.weekPlanSets.length}, ShiftAssignments=${nextSnapshot.shiftAssignments.length}`);
  };

  reader.readAsArrayBuffer(file);
  event.target.value = '';
}

async function loadMasterdataCatalog() {
  try {
    const plant = String(document.getElementById('masterdataPlant')?.value || '').trim();
    const select = document.getElementById('masterdataTemplateCatalog');
    if (!select) return;

    setMasterdataTemplateStatus(tr('catalogLoading'));
    const suffix = plant ? `?plant=${encodeURIComponent(plant)}` : '';
    const list = await fetchJsonWithFriendlyErrors(`/api/masterdata-templates${suffix}`, 'Loading master data catalog failed.');

    const rows = Array.isArray(list) ? list : [];
    select.innerHTML = '';
    if (!rows.length) {
      select.innerHTML = `<option value="">${tr('noTemplatesFound')}</option>`;
      setMasterdataTemplateStatus(tr('noTemplatesAvailable'));
      return;
    }

    select.innerHTML = rows.map((row) => {
      const ts = row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '';
      const label = `${row.templateName} | ${tr('plantLabel').toLowerCase()}=${row.plant}${ts ? ` | ${ts}` : ''}`;
      return `<option value="${row.id}" data-plant="${row.plant}" data-template-name="${row.templateName}">${label}</option>`;
    }).join('');
    setMasterdataTemplateStatus(`${tr('catalogLoadedPrefix')} (${rows.length} Templates).`);
  } catch (err) {
    setMasterdataTemplateStatus(err.message || tr('catalogLoadFailed'), true);
  }
}

async function loadPlantOptions() {
  try {
    const plantSelect = document.getElementById('masterdataPlant');
    if (!plantSelect) return;

    const list = await fetchJsonWithFriendlyErrors('/api/masterdata-templates', 'Loading plant list failed.');
    const rows = Array.isArray(list) ? list : [];
    const plants = [...new Set(rows.map((r) => String(r.plant || '').trim()).filter(Boolean))];
    if (!plants.length) plants.push('PLANT_XXX');

    const current = String(plantSelect.value || '').trim();
    if (current && !plants.includes(current)) plants.unshift(current);

    plantSelect.innerHTML = plants.map((p) => `<option value="${p}">${p}</option>`).join('');
    plantSelect.value = current || plants[0];
  } catch (_) {
    const plantSelect = document.getElementById('masterdataPlant');
    if (plantSelect && !plantSelect.options.length) {
      plantSelect.innerHTML = '<option value="PLANT_XXX">PLANT_XXX</option>';
      plantSelect.value = 'PLANT_XXX';
    }
  }
}

async function applySelectedPlantMasterdata() {
  await loadMasterdataCatalog();
  const select = document.getElementById('masterdataTemplateCatalog');
  if (!select || !select.options.length || !select.value) return;

  const firstOption = select.options[0];
  if (firstOption && firstOption.value) {
    select.value = firstOption.value;
    await applyMasterdataTemplate();
  }
}

async function storeMasterdataTemplate() {
  try {
    const plant = String(document.getElementById('masterdataPlant')?.value || '').trim();
    const templateInput = document.getElementById('masterdataTemplateName');
    const templateNameRaw = String(templateInput?.value || '').trim();

    if (!plant) {
      alert(tr('plantRequired'));
      return;
    }

    const templateName = templateNameRaw || `Template_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    if (templateInput && !templateInput.value.trim()) templateInput.value = templateName;

    setMasterdataTemplateStatus(tr('templateSaving'));
    const saveResponse = await fetchJsonWithFriendlyErrors('/api/masterdata-template', 'Saving master data template failed.', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plant,
        templateName,
        payload: buildMasterdataSnapshot()
      })
    });

    const syncInfo = saveResponse?.liveAssignmentSync || null;
    const syncSuffix = syncInfo && syncInfo.enabled
      ? ` Live assignment sync: lines=${Number(syncInfo.replacedLines || 0)}, assignments=${Number(syncInfo.upsertedAssignments || 0)}.`
      : '';
    setMasterdataTemplateStatus(`${tr('templateSavedForPlantPrefix')} '${plant}' (${templateName}).${syncSuffix}`);
    await loadMasterdataCatalog();
  } catch (err) {
    setMasterdataTemplateStatus(err.message || 'Saving template failed.', true);
  }
}

async function applyMasterdataTemplate() {
  try {
    const select = document.getElementById('masterdataTemplateCatalog');
    const id = Number(select?.value || 0);
    if (!Number.isInteger(id) || id <= 0) {
      alert(tr('selectTemplateFromCatalog'));
      return;
    }

    setMasterdataTemplateStatus(tr('templateLoading'));
    const data = await fetchJsonWithFriendlyErrors(`/api/masterdata-templates/${id}`, 'Loading selected template failed.');
    applyMasterdataSnapshot(data?.payload || {});

    if (data?.plant) {
      const plantInput = document.getElementById('masterdataPlant');
      if (plantInput) plantInput.value = data.plant;
    }
    if (data?.templateName) {
      const templateInput = document.getElementById('masterdataTemplateName');
      if (templateInput) templateInput.value = data.templateName;
    }

    setMasterdataTemplateStatus(`${tr('templateLoadedPrefix')}: ${data?.templateName || id}`);
  } catch (err) {
    setMasterdataTemplateStatus(err.message || tr('templateLoadFailed'), true);
  }
}

async function renameSelectedTemplatePlant() {
  try {
    const select = document.getElementById('masterdataTemplateCatalog');
    const id = Number(select?.value || 0);
    const templateName = String(select?.selectedOptions?.[0]?.dataset?.templateName || '').trim();
    const newPlant = String(document.getElementById('masterdataPlant')?.value || '').trim();

    if (!Number.isInteger(id) || id <= 0) {
      alert(tr('selectTemplateFromCatalog'));
      return;
    }
    if (!newPlant) {
      alert(tr('selectTargetPlantFirst'));
      return;
    }

    setMasterdataTemplateStatus(tr('renamingPlant'));
    await fetchJsonWithFriendlyErrors(`/api/masterdata-templates/${id}/plant`, 'Renaming plant failed.', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plant: newPlant })
    });

    await loadPlantOptions();
    const plantSelect = document.getElementById('masterdataPlant');
    if (plantSelect) plantSelect.value = newPlant;
    await loadMasterdataCatalog();

    const refreshedCatalog = document.getElementById('masterdataTemplateCatalog');
    if (refreshedCatalog) {
      const matchingOption = Array.from(refreshedCatalog.options || []).find((opt) => {
        if (Number(opt.value) === id) return true;
        const optTemplateName = String(opt.dataset?.templateName || '').trim();
        return !!templateName && optTemplateName === templateName;
      });
      if (matchingOption) {
        refreshedCatalog.value = matchingOption.value;
      }
    }

    await applyMasterdataTemplate();
    setMasterdataTemplateStatus(`${tr('templatePlantRenamedPrefix')} '${newPlant}'.`);
  } catch (err) {
    setMasterdataTemplateStatus(err.message || tr('renamingPlantFailed'), true);
  }
}

window.exportAllMasterdataExcel = exportAllMasterdataExcel;
window.importAllMasterdataExcel = importAllMasterdataExcel;
window.exportPlantXtotalExcel = exportAllMasterdataExcel;
window.importPlantXtotalExcel = importAllMasterdataExcel;
window.fillWithSampleMasterdata = fillWithSampleMasterdata;
window.loadPlantOptions = loadPlantOptions;
window.loadMasterdataCatalog = loadMasterdataCatalog;
window.storeMasterdataTemplate = storeMasterdataTemplate;
window.applyMasterdataTemplate = applyMasterdataTemplate;
window.renameSelectedTemplatePlant = renameSelectedTemplatePlant;
window.applySelectedPlantMasterdata = applySelectedPlantMasterdata;
// ----------- Initial Render --------
// ----------- MODAL LOGIK -----------
let assignModal = null;
let assignStationsSelect = null;
let assignLineSelect = null;
let assignedStationsSelect = null;
function renderAssignmentsList() {
  const container = document.getElementById('assignmentsList');
  if (!container) return;
  if (assignments.length === 0) {
    container.innerHTML = `<div class="text-muted">${tr('noAssignmentsYet')}</div>`;
    return;
  }
  // Group by line
  const grouped = {};
  assignments.forEach(a => {
    if (!grouped[a.lineId]) grouped[a.lineId] = [];
    grouped[a.lineId].push(a.stationId);
  });
  container.innerHTML = Object.keys(grouped).map(lineId => `
    <div class="mb-2">
      <b class="assignment-line-id">${lineId}</b>:
      ${grouped[lineId].map(stId => `
        <span class="badge bg-secondary me-1">
          ${stId}
          <button class="btn btn-sm btn-danger ms-1 py-0 px-1" style="font-size:0.8em;" title="Remove"
            onclick="deleteAssignmentByLineStation('${lineId}','${stId}')">&times;</button>
        </span>
      `).join('')}
    </div>
  `).join('');
}
function openAssignDialog() {
  assignModal = document.getElementById('assignModal');
  assignStationsSelect = document.getElementById('assignStationsSelect');
  assignLineSelect = document.getElementById('assignLineSelect');
  assignedStationsSelect = document.getElementById('assignedStationsSelect');
  if (!assignModal || !assignStationsSelect || !assignLineSelect || !assignedStationsSelect)
    return;
  if (!lines.length) {
    alert('No line available');
    return;
  }
  if (!stations.length) {
    alert('No station available');
    return;
  }
  // Fill Lines
  assignLineSelect.innerHTML = lines.map(l => `<option value="${l.id}">${l.id}</option>`).join('');
  assignLineSelect.onchange = updateAssignedStationsList;
  // Fill Stations
  assignStationsSelect.innerHTML = stations.map(s => `<option value="${s.id}">${s.id} - ${s.description}</option>`).join('');
  // Fill Assigned Stations
  updateAssignedStationsList();
  // Show Modal
  assignModal.style.display = "block";
  assignModal.classList.add("show");
  assignModal.setAttribute("aria-modal", "true");
  assignModal.removeAttribute("aria-hidden");
  document.body.style.overflow = "hidden";
}
function closeAssignDialog() {
  if (!assignModal)
    return;
  assignModal.style.display = "none";
  assignModal.classList.remove("show");
  assignModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
function updateAssignedStationsList() {
  if (!assignLineSelect || !assignedStationsSelect)
    return;
  const lineId = assignLineSelect.value;
  const assigned = assignments.filter(a => a.lineId === lineId).map(a => a.stationId);
  assignedStationsSelect.innerHTML = assigned.map(stId => {
    const st = stations.find(s => s.id === stId);
    return `<option value="${stId}">${stId}${st ? ' - ' + st.description : ''}</option>`;
  }).join('');
}
function assignSelectedStations() {
  if (!assignLineSelect || !assignStationsSelect)
    return;
  const lineId = assignLineSelect.value;
  if (!lineId) {
    alert('Please select a line first.');
    return;
  }
  const selectedStations = Array.from(assignStationsSelect.selectedOptions).map(opt => opt.value);
  if (!selectedStations.length) {
    alert('Please select at least one station.');
    return;
  }
  let changed = false;
  selectedStations.forEach(stId => {
    if (!assignments.some(a => a.lineId === lineId && a.stationId === stId)) {
      assignments.push({ lineId, stationId: stId });
      changed = true;
    }
  });
  if (changed) {
    updateAssignedStationsList();
    renderAssignmentsList();
  }
}
function removeSelectedStations() {
  if (!assignLineSelect || !assignedStationsSelect)
    return;
  const lineId = assignLineSelect.value;
  const selectedStations = Array.from(assignedStationsSelect.selectedOptions).map(opt => opt.value);
  assignments = assignments.filter(a => !(a.lineId === lineId && selectedStations.includes(a.stationId)));
  updateAssignedStationsList();
  renderAssignmentsList();
}
function saveAssignmentsDialog() {
  closeAssignDialog();
  renderAssignmentsList();
}
window.deleteAssignmentByLineStation = function(lineId, stationId) {
  assignments = assignments.filter(a => !(a.lineId === lineId && a.stationId === stationId));
  renderAssignmentsList();
  renderAssignments && renderAssignments();
};
// Modal ESC close
window.addEventListener('keydown', function (e) {
  if (e.key === "Escape" && assignModal && assignModal.style.display === "block") {
    closeAssignDialog();
  }
  if (e.key === "Escape") {
    const modal = document.getElementById('authModal');
    if (modal && modal.style.display === 'block') {
      closeAuthDialog();
    }
  }
});
window.openAssignDialog = openAssignDialog;
window.closeAssignDialog = closeAssignDialog;
window.assignSelectedStations = assignSelectedStations;
window.removeSelectedStations = removeSelectedStations;
window.saveAssignmentsDialog = saveAssignmentsDialog;
window.renderAssignmentsList = renderAssignmentsList;
// ----------- Initial Render vereinheitlicht -----------
window.onload = () => {
  initTheme();
  currentLang = getLanguage();
  syncAuthInputs();
  mqttExplorerEnsureProfileCollectionInitialized();
  mqttExplorerLoadProfileFromStorage();

  const authProviderInput = document.getElementById('headerAuthProviderInput');
  if (authProviderInput) {
    authProviderInput.addEventListener('change', () => {
      setStoredAuthProvider(authProviderInput.value || 'local');
      updateAuthDialogProviderUi(authProviderInput.value || 'local');
    });
  }

  fetch('/api/auth/status')
    .then((res) => res.json())
    .then((body) => {
      if (Array.isArray(body?.availablePermissions) && body.availablePermissions.length > 0) {
        knownPermissions = body.availablePermissions;
      }
    })
    .catch(() => {
      // Ignore status fetch failures.
    });
  setAuthStatus(getRefreshToken() ? 'Session token available.' : 'Legacy/manual token mode.');
  renderStations();
  renderLines();
  renderAssignmentsList && renderAssignmentsList();
  renderAssignments && renderAssignments();
  renderTEs();
  renderWPs();
  renderAssignedShiftSchedules();
  populateApiCatalogUI();
  mqttExplorerRenderVariables();
  mqttExplorerPersistProfileToStorage();
  mqttExplorerRefreshStatus();

  const mqttProfileSelect = document.getElementById('mqttProfileSelect');
  if (mqttProfileSelect) {
    mqttProfileSelect.addEventListener('change', () => {
      const collection = mqttExplorerReadProfileCollection();
      collection.selectedName = mqttExplorerGetSelectedProfileName();
      mqttExplorerWriteProfileCollection(collection);
    });
  }
  if (loadPlantOptions) {
    loadPlantOptions()
      .then(() => {
        if (applySelectedPlantMasterdata) return applySelectedPlantMasterdata();
        return null;
      })
      .finally(() => {
        if (!hasAnyMasterdata()) fillWithSampleMasterdata(true);
      });
  } else if (!hasAnyMasterdata()) {
    fillWithSampleMasterdata(true);
  }
  applyLanguage();

  const plantInput = document.getElementById('masterdataPlant');
  if (plantInput) {
    plantInput.addEventListener('change', async () => {
      await applySelectedPlantMasterdata();
    });
  }

  const templateCatalog = document.getElementById('masterdataTemplateCatalog');
  if (templateCatalog) {
    templateCatalog.addEventListener('change', async () => {
      const selectedId = Number(templateCatalog.value || 0);
      if (Number.isInteger(selectedId) && selectedId > 0) {
        await applyMasterdataTemplate();
      }
    });
  }

  // Clear weekplan name initially and mark it as required
  setTimeout(() => {
    const nameInput = document.getElementById('wpSetName');
    if (nameInput) {
    nameInput.value = '';
    nameInput.classList.add('is-invalid');
    nameInput.focus();
    }
    const titleDiv = nameInput && nameInput.closest('caption').querySelector('.fw-bold');
    if (titleDiv) titleDiv.textContent = '';
  }, 0);
};

window.addEventListener('beforeunload', () => {
  mqttExplorerStopPolling();
});

function importExcel(event, type) {
  var file = event.target.files[0];
  if (!file) return;

  function normalizeImportedTime(raw) {
    if (raw == null || raw === '') return '';

    const toHm = (fraction) => {
      const minutesOfDay = Math.round((fraction % 1) * 24 * 60);
      const h = Math.floor(minutesOfDay / 60) % 24;
      const m = minutesOfDay % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw < 1) {
      return toHm(raw);
    }

    const text = String(raw).trim();
    if (/^\d+(?:\.\d+)?$/.test(text)) {
      const parsed = Number(text);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed < 1) {
        return toHm(parsed);
      }
    }
    return text;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    var data = new Uint8Array(e.target.result);
    var workbook = XLSX.read(data, { type: 'array' });
    var sheetName = workbook.SheetNames[0];
    var sheet = workbook.Sheets[sheetName];
    var json = XLSX.utils.sheet_to_json(sheet);
    let importedSectionLabel = '';

    if (type === "stations") {
      const importedStations = json.map(function(row) {
        const bottleneckRaw = row["Bottleneck"] ?? row["bottleneck"] ?? row["isBottleneck"] ?? row["is_bottleneck"];
        const cycleTimeRaw = row["Cycle Time (s)"] ?? row["Cycle Time"] ?? row["cycleTime"] ?? row["cycle_time"];
        const parsedCycleTime = cycleTimeRaw === '' || cycleTimeRaw == null ? null : Number(cycleTimeRaw);
        return {
          id: row["Station ID"] || row["id"] || "",
          description: row["Description"] || row["description"] || "",
          bottleneck: bottleneckRaw === true || bottleneckRaw === 1 || bottleneckRaw === '1' || String(bottleneckRaw || '').toLowerCase() === 'true',
          cycleTime: Number.isNaN(parsedCycleTime) ? null : parsedCycleTime
        };
      }).filter((row) => String(row.id || '').trim());
      stations = upsertByKey(stations, importedStations, (row) => String(row.id || '').trim());
      importedSectionLabel = 'Stations';
      if (typeof renderStations === "function") renderStations();
    } else if (type === "lines") {
      const importedLines = json.map(function(row) {
        return {
          id: row["Line ID"] || row["id"] || "",
          description: row["Description"] || row["description"] || ""
        };
      }).filter((row) => String(row.id || '').trim());
      lines = upsertByKey(lines, importedLines, (row) => String(row.id || '').trim());
      importedSectionLabel = 'Lines';
      if (typeof renderLines === "function") renderLines();
    } else if (type === "assignments") {
      const importedAssignments = json.map(function(row) {
        return {
          lineId: row["Line"] || row["lineId"] || "",
          stationId: row["Station"] || row["stationId"] || ""
        };
      }).filter((row) => String(row.lineId || '').trim() && String(row.stationId || '').trim());
      assignments = upsertByKey(assignments, importedAssignments, (row) => `${String(row.lineId || '').trim()}|${String(row.stationId || '').trim()}`);
      importedSectionLabel = 'Assignments';
      if (typeof renderAssignmentsList === "function") renderAssignmentsList();
      if (typeof renderAssignments === "function") renderAssignments();
    } else if (type === "timeEvents") {
      const importedTimeEvents = json.map(function(row) {
        return {
          id: row["ID"] || row["id"] || "",
          description: row["Description"] || row["description"] || "",
          productive: (typeof row["Productive"] !== 'undefined') ? (row["Productive"] == 1 || row["Productive"] === true || row["Productive"] === '1' ? 1 : 0) : 1
        };
      }).filter((row) => String(row.id || '').trim());
      timeEvents = upsertByKey(timeEvents, importedTimeEvents, (row) => String(row.id || '').trim());
      importedSectionLabel = 'Time events';
      if (typeof renderTEs === "function") renderTEs();
    } else if (type === "weekPlans") {
      let importedName = '';
      const importedEntries = [];
      json.forEach(function(row, i) {
        // Shift model name as its own header row (first row)
        if (i === 0 && row["Weekday"] && typeof row["Weekday"] === 'string' && (row["Weekday"].startsWith('Weekplan name:') || row["Weekday"].startsWith('Shift Modell Name:'))) {
          importedName = row["Weekday"].replace('Weekplan name:', '').replace('Shift Modell Name:', '').trim();
        } else if (row["Weekday"] || row["Shift Name"] || row["Start"] || row["End"] || row["Duration"] || typeof row["Productive"] !== 'undefined') {
          importedEntries.push({
            name: '',
            day: row["Weekday"] || row["day"] || "",
            shift: row["Shift Name"] || row["shift"] || "",
            start: normalizeImportedTime(row["Start"] ?? row["start"]),
            end: normalizeImportedTime(row["End"] ?? row["end"]),
            duration: row["Duration"] || row["duration"] || "",
            productive: (typeof row["Productive"] !== 'undefined') ? (row["Productive"] == 1 || row["Productive"] === true || row["Productive"] === '1' ? 1 : 0) : 1
          });
        }
      });
      setTimeout(() => {
        if (typeof renderWPs === "function") renderWPs();
        const resolvedName = importedName || 'Imported Shift Model';
        if (importedEntries.length > 0) {
          const entriesCopy = JSON.parse(JSON.stringify(importedEntries));
          const existingIdx = weekPlanSets.findIndex((wps) => String(wps.name || '').trim() === resolvedName);
          if (existingIdx >= 0) weekPlanSets[existingIdx].entries = entriesCopy;
          else weekPlanSets.push({ name: resolvedName, entries: entriesCopy });

          weekPlans = entriesCopy;

          setTimeout(() => {
            const nameInput = document.getElementById('wpSetName');
            if (nameInput) nameInput.value = resolvedName;
            const titleDiv = nameInput && nameInput.closest('caption')?.querySelector('.fw-bold');
            if (titleDiv) titleDiv.textContent = resolvedName;
          }, 0);
        }
        populateAssignShiftScheduleUI();
      }, 0);
      importedSectionLabel = 'Shift models';
    } else if (type === "shiftSchedules") {
      const seen = new Set();
      const rejected = [];
      let duplicateCount = 0;

      function normalizeTargetType(rawType, targetId) {
        const value = String(rawType || '').trim().toLowerCase();
        if (value === 'line' || value === 'station') return value;
        const id = String(targetId || '').trim();
        if (!id) return '';
        const isLine = (Array.isArray(lines) ? lines : []).some((l) => String(l.id || '').trim() === id);
        if (isLine) return 'line';
        const isStation = (Array.isArray(stations) ? stations : []).some((s) => String(s.id || '').trim() === id);
        if (isStation) return 'station';
        return '';
      }

      const importedShiftAssignments = json.map(function(row, idx) {
        const rec = {
          modellName: String(row["Shift Modell"] || row["Shift Model"] || row["modellName"] || row["Model"] || '').trim(),
          shiftId: String(row["Shift ID"] || row["shiftId"] || row["ID"] || row["id"] || '').trim(),
          day: String(row["Day"] || row["Weekday"] || row["day"] || '').trim(),
          shift: String(row["Shift"] || row["Shift Name"] || row["shift"] || row["Name"] || row["name"] || '').trim(),
          start: String(row["Start"] || row["start"] || '').trim(),
          end: String(row["End"] || row["end"] || '').trim(),
          duration: String(row["Duration"] || row["duration"] || '').trim(),
          targetType: normalizeTargetType(row["Target Type"] || row["targetType"], row["Target ID"] || row["targetId"]),
          targetId: String(row["Target ID"] || row["targetId"] || '').trim(),
          targetLabel: String(row["Target Label"] || row["targetLabel"] || row["Description"] || row["description"] || '').trim()
        };

        // Backward compatibility: legacy rows may only have ID/Description.
        if (!rec.targetId && (row["ID"] || row["id"])) {
          rec.targetId = String(row["ID"] || row["id"] || '').trim();
        }
        if (!rec.targetLabel && (row["Description"] || row["description"])) {
          rec.targetLabel = String(row["Description"] || row["description"] || '').trim();
        }
        if (!rec.targetType) {
          rec.targetType = normalizeTargetType('', rec.targetId);
        }

        const hasUsefulData = rec.shiftId || rec.modellName || rec.targetId;
        if (!hasUsefulData) {
          return null;
        }

        // Required minimum for assignment rows.
        if (!rec.targetType || !rec.targetId) {
          rejected.push(`Row ${idx + 2}: missing targetType/targetId`);
          return null;
        }

        const key = [rec.shiftId, rec.targetType, rec.targetId, rec.day, rec.shift].join('|');
        if (seen.has(key)) {
          duplicateCount++;
          return null;
        }
        seen.add(key);
        return rec;
      }).filter(Boolean);

      shiftAssignmentRecords = upsertByKey(
        shiftAssignmentRecords,
        importedShiftAssignments,
        (r) => [r.shiftId, r.targetType, r.targetId, r.day, r.shift].join('|')
      );

      renderAssignedShiftSchedules();

      const accepted = importedShiftAssignments.length;
      const rejectedCount = rejected.length;
      const preview = rejected.slice(0, 5).join('\n');
      const suffix = rejectedCount > 5 ? `\n...and ${rejectedCount - 5} more` : '';
      const summary = `Shift assignments import: ${accepted} merged` +
        (duplicateCount ? `, ${duplicateCount} duplicates skipped` : '') +
        (rejectedCount ? `, ${rejectedCount} invalid skipped` : '');

      if (rejectedCount > 0) {
        alert(`${summary}\n\nInvalid rows:\n${preview}${suffix}`);
      } else {
        alert(summary);
      }
      importedSectionLabel = 'Shift assignments';
    }

    if (importedSectionLabel) {
      syncCurrentTemplateSnapshot(importedSectionLabel);
    }
  };
  reader.readAsArrayBuffer(file);
  // Reset input, so the same file can be imported again if needed
  event.target.value = "";
}

// Funktion global machen:
window.importExcel = importExcel;