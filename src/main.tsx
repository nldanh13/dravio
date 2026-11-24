import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { GameSession } from './platform/gameSession';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Một phiên cho mỗi tab, tạo ngoài React để StrictMode không mở hai người ghi.
const session = new GameSession();
void session.start();

createRoot(root).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>,
);
