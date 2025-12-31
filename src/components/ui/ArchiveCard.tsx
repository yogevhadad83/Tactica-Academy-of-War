import './ArchiveCard.css';

interface ArchiveCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

const ArchiveCard = ({ children, className = '', onClick }: ArchiveCardProps) => {
  const baseClass = 'archive-card';
  const classes = [baseClass, className].filter(Boolean).join(' ');
  
  return (
    <div className={classes} onClick={onClick}>
      {children}
    </div>
  );
};

export default ArchiveCard;
