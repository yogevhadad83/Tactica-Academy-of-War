import styles from './ResourceDisplay.module.css';

interface ResourceDisplayProps {
  type: 'credits' | 'supply';
  value: number;
}

export const ResourceDisplay = ({ type, value }: ResourceDisplayProps) => {
  const imageSrc = type === 'credits' ? '/images/hud/credits.png' : '/images/hud/supply.png';
  const altText = type === 'credits' ? 'Credits' : 'Supply';
  const typeClass = type === 'credits' ? styles.credits : styles.supply;
  
  return (
    <div className={`${styles.resource} ${typeClass}`}>
      <img src={imageSrc} alt={altText} className={styles.icon} draggable={false} />
      <span className={styles.value}>{value}</span>
    </div>
  );
};
