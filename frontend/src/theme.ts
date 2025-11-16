import { extendTheme, ThemeConfig } from '@chakra-ui/react';

const config: ThemeConfig = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

const colors = {
  brand: {
    50: '#e3f3ff',
    100: '#c1dbff',
    200: '#97c2ff',
    300: '#6ca8ff',
    400: '#418eff',
    500: '#2875e6',
    600: '#1b5ab4',
    700: '#123f82',
    800: '#082551',
    900: '#020b24',
  },
};

export const theme = extendTheme({
  config,
  colors,
  fonts: {
    heading: 'Space Grotesk, Inter, system-ui, -apple-system, BlinkMacSystemFont',
    body: 'Inter, system-ui, -apple-system, BlinkMacSystemFont',
  },
  styles: {
    global: {
      body: {
        bg: 'gray.900',
        color: 'gray.100',
        minHeight: '100vh',
      },
      '*::placeholder': {
        color: 'gray.500',
      },
    },
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: '600',
        borderRadius: 'full',
      },
      variants: {
        solid: {
          bgGradient: 'linear(to-r, brand.500, purple.500)',
          _hover: {
            bgGradient: 'linear(to-r, brand.400, purple.400)',
            transform: 'translateY(-1px)',
          },
          _active: { transform: 'translateY(0)' },
        },
        ghost: {
          color: 'gray.300',
          _hover: { color: 'white', bg: 'whiteAlpha.100' },
        },
      },
    },
    Card: {
      baseStyle: {
        borderWidth: '1px',
        borderColor: 'whiteAlpha.200',
        bg: 'whiteAlpha.50',
        backdropFilter: 'blur(12px)',
      },
    },
  },
});
