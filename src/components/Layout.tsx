import { Outlet } from 'react-router-dom';
import styles from './Layout.module.css';
import './Layout.css';

const Layout = () => {
  return (
    <div className="layout">
      <div className={styles.page}>
        <main className="main-content">
          <Outlet />
        </main>
        <footer className="footer">
          <p>Tactica: Academy of War - Browser-based PvP Strategy Game</p>
          <p className="footer-note">Built with React + TypeScript</p>
        </footer>
      </div>
    </div>
  );
};

export default Layout;
