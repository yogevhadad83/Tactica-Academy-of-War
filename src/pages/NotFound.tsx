import { Link, useLocation } from 'react-router-dom';

const NotFound = () => {
  const location = useLocation();

  return (
    <div style={{ padding: 24 }}>
      <h1>Page not found</h1>
      <p>
        No route matches <strong>{location.pathname}</strong>.
      </p>
      <p>
        <Link to="/academy">Go to Academy</Link>
      </p>
    </div>
  );
};

export default NotFound;
