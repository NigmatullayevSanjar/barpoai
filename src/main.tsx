import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import '@fontsource/geist/700.css';
import '@fontsource/geist/800.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/600.css';
import '@fontsource/geist-mono/700.css';
import '@fontsource/geist/300.css';
import '@fontsource/geist/900.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/poppins/600.css';


import './design.css';
import './app.css';
import './fidelity.css';
import './superadmin/superadmin.css';
import './technician/technician.css';
import './platformowner/platformowner.css';
import './accountant/accountant.css';
import './financier/financier.css';
import { App } from './ui/App';
import { BackendGate } from './api/BackendGate';
createRoot(document.getElementById('root')!).render(<React.StrictMode><BackendGate><App /></BackendGate></React.StrictMode>);
