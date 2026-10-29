import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import App from './App'
import './index.css'

// AuthProvider wraps DataProvider: the data can only be loaded once we know who is signed in.
createRoot(document.getElementById('root')).render(
  <StrictMode>  @"
  **/node_modules/
  **/.env
  hospital-api/data/*.db
  hospital-api/data/*.db-shm
  hospital-api/data/*.db-wal
  hospital-api/data/backups/
  "@ | Set-Content .gitignore
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)