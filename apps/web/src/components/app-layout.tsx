import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getAuthSession, getFallbackUsers, listDemoUsers, readSelectedUser, writeSelectedUser } from "@/api/auth.js";

const navigation = [
  { to: "/overview", label: "Overview" },
  { to: "/platform", label: "Platform" },
  { to: "/incidents", label: "Incidents" },
  { to: "/services", label: "Services" },
  { to: "/approvals", label: "Approvals" },
  { to: "/runbooks", label: "Runbooks" },
  { to: "/audit", label: "Audit" }
];

export function AppLayout() {
  const usersQuery = useQuery({
    queryKey: ["auth-users"],
    queryFn: listDemoUsers
  });
  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: getAuthSession
  });

  const users = usersQuery.data ?? getFallbackUsers();

  useEffect(() => {
    if (readSelectedUser()) {
      return;
    }

    const defaultUser = users.find((user) => user.userId === "manager.demo") ?? users[0];
    if (defaultUser) {
      writeSelectedUser({
        userId: defaultUser.userId,
        role: defaultUser.role
      });
    }
  }, [users]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Enterprise Resilience Agent</p>
          <h1 className="sidebar-title">Multicloud control plane</h1>
        </div>
        <div className="session-panel">
          <span className="eyebrow">Current access</span>
          <strong>{sessionQuery.data?.displayName ?? "Loading session..."}</strong>
          <p className="muted">
            {sessionQuery.data?.role ?? "loading"} · {sessionQuery.data?.source ?? "demo-default"}
          </p>
          <label className="field-label" htmlFor="demo-user-select">
            Demo user
          </label>
          <select
            id="demo-user-select"
            className="session-select"
            defaultValue={readSelectedUser()?.userId ?? "manager.demo"}
            onChange={(event) => {
              const selected = users.find((user) => user.userId === event.target.value);
              if (!selected) {
                return;
              }

              writeSelectedUser({
                userId: selected.userId,
                role: selected.role
              });
              window.location.reload();
            }}
          >
            {users.map((user) => (
              <option key={user.userId} value={user.userId}>
                {user.displayName} · {user.role}
              </option>
            ))}
          </select>
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
