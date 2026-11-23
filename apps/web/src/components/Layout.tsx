import { Link, Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <>
      <header>
        <nav>
          <Link to="/">ChainTelescope</Link>
          <span>
            {" · "}
            <Link to="/">Dashboard</Link>
          </span>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
