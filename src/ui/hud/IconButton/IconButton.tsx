import styles from './IconButton.module.css';

interface IconButtonProps {
  icon: 'settings' | 'help';
  onClick: () => void;
}

export const IconButton = ({ icon, onClick }: IconButtonProps) => {
  const symbol = icon === 'settings' ? '⚙' : '?';
  
  return (
    <button 
      className={styles.button} 
      onClick={onClick}
      aria-label={icon}
      type="button"
    >
      <img 
        src="/images/hud/setting-button.png" 
        alt=""
        className={styles.background}
      />
      <span className={styles.symbol}>{symbol}</span>
    </button>
  );
};
