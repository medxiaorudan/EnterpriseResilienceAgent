import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/overview", label: "Overview" },
  { to: "/incidents", label: "Incidents" },
  { to: "/services", label: "Services" },
  { to: "/approvals", label: "Approvals" },
  { to: "/runbooks", label: "Runbooks" },
  { to: "/audit", label: "Audit" }
];

export function AppLayout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Enterprise Resilience Agent</p>
          <h1 className="sidebar-title">AWS-first multicloud control plane</h1>
        </div>
        <nav className="nav-list">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
