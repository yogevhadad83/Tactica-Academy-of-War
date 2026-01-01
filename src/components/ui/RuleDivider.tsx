import './RuleDivider.css';

interface RuleDividerProps {
  text?: string;
  accent?: boolean;
}

const RuleDivider = ({ text, accent = false }: RuleDividerProps) => {
  return (
    <div className={`rule-divider ${accent ? 'accent' : ''}`}>
      {text && <span className="rule-text">{text}</span>}
    </div>
  );
};

export default RuleDivider;
