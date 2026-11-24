import { PowerSyncContext } from '@powersync/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initPowerSync, powerSyncDb } from './lib/powersync-db';
import './index.css';

void initPowerSync();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <PowerSyncContext.Provider value={powerSyncDb}>
      <App />
    </PowerSyncContext.Provider>
  </StrictMode>,
);
