import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import QueryProvider from './providers/QueryProvider';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </React.StrictMode>
);
