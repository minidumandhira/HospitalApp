import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { NAV } from '../config/modules'
import { roleName } from '../config/roles'

// Sidebar + page area. Only menu items the signed-in role may open are shown.
export default function Layout() {
  const { user, can, logout } = useAuth()

  return (
    <div className="app">
      <nav>
        <b>HMS</b>
        <small>{user.name}<br />{roleName(user.role)}</small>
        {NAV.filter((n) => can(n.key)).map((n) => (
          <NavLink key={n.key} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'cur' : '')}>
            {n.label}
          </NavLink>
        ))}
        <a href="#" onClick={(e) => { e.preventDefault(); logout() }}>Sign out</a>
      </nav>
      <main><Outlet /></main>
    </div>
  )
}
