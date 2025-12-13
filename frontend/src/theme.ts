import { extendTheme, ThemeConfig } from '@chakra-ui/react';

const config: ThemeConfig = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

const colors = {
  brand: {
    50: '#e8f8ff',
    100: '#c6eaff',
    200: '#9bdcff',
    300: '#6fcfff',
    400: '#4fd8ff',
    500: '#25b5e6',
    600: '#1a8db4',
    700: '#116882',
    800: '#0a4451',
    900: '#041926',
  },
  surface: {
    900: '#05060a',
    800: '#0b0f14',
    700: '#0f1724',
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
        bg: 'surface.900',
        color: 'gray.50',
        minHeight: '100vh',
        backgroundImage:
          'radial-gradient(circle at 20% 15%, rgba(79, 216, 255, 0.12), transparent 28%), radial-gradient(circle at 80% 0%, rgba(168, 85, 247, 0.16), transparent 26%), linear-gradient(140deg, #05060a 0%, #060815 40%, #05060a 100%)',
        backgroundAttachment: 'fixed',
        WebkitFontSmoothing: 'antialiased',
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
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        fontSize: 'xs',
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
        outline: {
          borderColor: 'whiteAlpha.300',
          color: 'gray.100',
          bg: 'rgba(13, 18, 30, 0.55)',
          _hover: {
            borderColor: 'brand.400',
            color: 'white',
            boxShadow: '0 0 16px rgba(79, 216, 255, 0.35)',
          },
        },
      },
    },
    Card: {
      baseStyle: {
        borderWidth: '1px',
        borderColor: 'whiteAlpha.200',
        bg: 'rgba(9, 13, 22, 0.8)',
        backdropFilter: 'blur(14px)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      },
    },
  },
});
