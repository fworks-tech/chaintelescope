import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <section>
      <h1>Not found</h1>
      <p>
        <Link to="/">Back to the dashboard</Link>
      </p>
    </section>
  );
}
