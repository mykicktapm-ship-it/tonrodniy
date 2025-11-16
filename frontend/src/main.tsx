import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { theme } from './theme';
import { TonConnectUIProvider } from './providers/TonConnectUIProvider';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ChakraProvider theme={theme}>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <BrowserRouter>
        <TonConnectUIProvider manifestUrl="/tonconnect-manifest.json">
          <App />
        </TonConnectUIProvider>
      </BrowserRouter>
    </ChakraProvider>
  </React.StrictMode>,
);
