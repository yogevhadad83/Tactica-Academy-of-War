import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import ArmyBuilder from './pages/ArmyBuilder';
import StrategyEditor from './pages/StrategyEditor';
import BoardView from './pages/BoardView';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="army-builder" element={<ArmyBuilder />} />
          <Route path="strategy" element={<StrategyEditor />} />
          <Route path="board" element={<BoardView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
