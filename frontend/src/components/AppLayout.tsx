import {
  Badge,
  Box,
  Container,
  Flex,
  HStack,
  Icon,
  Text,
  Button,
  VStack,
  useColorModeValue,
} from '@chakra-ui/react';
import { NavLink, Outlet } from 'react-router-dom';
import { APP_TABS } from '../lib/constants';
import { FiZap } from 'react-icons/fi';
import { TonConnectButton } from './wallet/TonConnectButton';

export function AppLayout() {
  const borderColor = useColorModeValue('whiteAlpha.150', 'whiteAlpha.150');
  const headerBg = useColorModeValue('rgba(7, 12, 24, 0.82)', 'rgba(7, 12, 24, 0.82)');

  return (
    <Box minH="100vh" position="relative" overflow="hidden">
      <Box
        position="absolute"
        inset={0}
        pointerEvents="none"
        bgGradient="radial(at 15% 20%, rgba(79,216,255,0.12), transparent 32%), radial(at 80% 0%, rgba(168,85,247,0.16), transparent 26%)"
        zIndex={0}
      />

      <Flex direction="column" minH="100vh" position="relative" zIndex={1}>
        <Box as="header" borderBottomWidth="1px" borderColor={borderColor} bg={headerBg} backdropFilter="blur(12px)" pos="sticky" top={0} zIndex={10}>
          <Container maxW="1100px" py={4} px={{ base: 4, md: 6 }}>
            <Flex align="center" justify="space-between" gap={4} wrap="wrap">
              <HStack spacing={3}>
                <Icon as={FiZap} boxSize={6} color="brand.400" />
                <VStack align="flex-start" spacing={0}>
                  <Text fontWeight="black" letterSpacing="0.08em" fontSize="sm">
                    TONRODY PULSE
                  </Text>
                  <Text fontSize="xs" color="gray.400">
                    Provably fair lobby rounds
                  </Text>
                </VStack>
              </HStack>
              <HStack spacing={2} flexWrap="wrap" justify="flex-end">
                <HStack
                  spacing={1}
                  borderWidth="1px"
                  borderColor="whiteAlpha.200"
                  borderRadius="full"
                  bg="rgba(10, 12, 20, 0.7)"
                  px={1}
                  py={1}
                >
                  {APP_TABS.map((tab) => (
                    <NavLink key={tab.path} to={tab.path} end={tab.path === '/'}>
                      {({ isActive }) => (
                        <Button
                          variant={isActive ? 'solid' : 'ghost'}
                          size="sm"
                          px={{ base: 3, md: 4 }}
                          fontSize="xs"
                        >
                          {tab.label}
                        </Button>
                      )}
                    </NavLink>
                  ))}
                </HStack>
                <Badge
                  colorScheme="purple"
                  borderRadius="full"
                  px={3}
                  py={1}
                  textTransform="uppercase"
                  fontWeight="700"
                  letterSpacing="0.08em"
                  bg="rgba(111, 90, 255, 0.16)"
                  borderWidth="1px"
                  borderColor="whiteAlpha.200"
                >
                  Beta UI
                </Badge>
                <TonConnectButton />
              </HStack>
            </Flex>
          </Container>
        </Box>

        <Container
          as="main"
          flex="1"
          maxW="1100px"
          px={{ base: 4, md: 6 }}
          py={{ base: 6, md: 10 }}
          w="full"
          display="flex"
          flexDirection="column"
          gap={6}
        >
          <Outlet />
        </Container>
      </Flex>
    </Box>
  );
}
