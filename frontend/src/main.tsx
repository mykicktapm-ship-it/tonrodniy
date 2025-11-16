import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react';
import { BrowserRouter } from 'react-router-dom';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import App from './App';
import { theme } from './theme';
import { TONCONNECT_MANIFEST_PATH } from './lib/constants';

const manifestUrl =
  import.meta.env.VITE_TONCONNECT_MANIFEST_URL ??
  (typeof window !== 'undefined'
    ? new URL(TONCONNECT_MANIFEST_PATH, window.location.origin).toString()
    : TONCONNECT_MANIFEST_PATH);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ChakraProvider theme={theme}>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <TonConnectUIProvider manifestUrl={manifestUrl}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </TonConnectUIProvider>
    </ChakraProvider>
  </React.StrictMode>,
);
