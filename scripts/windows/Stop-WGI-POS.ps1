foreach ($port in @(23865, 8080)) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    if ($connection.OwningProcess) {
      Start-Process -FilePath "taskkill.exe" -ArgumentList "/PID $($connection.OwningProcess) /T /F" -WindowStyle Hidden -Wait
    }
  }
}
