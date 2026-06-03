(async () => {
  const login = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'local', username: 'report', password: 'report' })
  });

  const loginText = await login.text();
  console.log('REPORT_API_LOGIN_STATUS', login.status);
  console.log(loginText);
  if (!login.ok) process.exit(1);

  const token = JSON.parse(loginText).accessToken;
  const stations = await fetch('http://localhost:3000/api/stations', {
    headers: { Authorization: `Bearer ${token}` }
  });

  const stationsText = await stations.text();
  console.log('REPORT_API_READ_STATUS', stations.status);
  console.log(stationsText);
  if (!stations.ok) process.exit(1);
})();
