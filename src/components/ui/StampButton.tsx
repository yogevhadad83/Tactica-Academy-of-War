import './StampButton.css';

interface StampButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

const StampButton = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  disabled = false 
}: StampButtonProps) => {
  return (
    <button
      className={`stamp-button ${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export default StampButton;
