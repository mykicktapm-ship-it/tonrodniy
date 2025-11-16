import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { theme } from './theme';
import { TonConnectUIProvider } from './providers/TonConnectUIProvider';
import { QueryClient, QueryClientProvider } from './lib/queryClient';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ChakraProvider theme={theme}>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TonConnectUIProvider manifestUrl="/tonconnect-manifest.json">
            <App />
          </TonConnectUIProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ChakraProvider>
  </React.StrictMode>,
);
