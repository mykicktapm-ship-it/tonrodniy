import { Box, Flex, HStack, Icon, Text, Button, useColorModeValue } from '@chakra-ui/react';
import { NavLink, Outlet } from 'react-router-dom';
import { APP_TABS } from '../lib/constants';
import { FiZap } from 'react-icons/fi';
import { TonConnectButton } from './wallet/TonConnectButton';

export function AppLayout() {
  const borderColor = useColorModeValue('blackAlpha.200', 'whiteAlpha.200');
  const headerBg = useColorModeValue('rgba(7, 12, 24, 0.9)', 'rgba(7, 12, 24, 0.9)');

  return (
    <Box
      minH="100vh"
      bgGradient="linear(to-br, #050914, #0b1327)"
      _before={{
        content: '""',
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        bgGradient: 'radial(at 20% 20%, rgba(64, 131, 255, 0.12), transparent 35%), radial(at 80% 0%, rgba(168, 85, 247, 0.14), transparent 30%)',
        zIndex: 0
      }}
    >
      <Flex direction="column" minH="100vh" position="relative" zIndex={1}>
        <Flex
          as="header"
          align="center"
          justify="space-between"
          px={{ base: 4, md: 10 }}
          py={4}
          borderBottomWidth="1px"
          borderColor={borderColor}
          bg={headerBg}
          backdropFilter="blur(10px)"
          position="sticky"
          top={0}
          zIndex={10}
        >
          <HStack spacing={3}>
            <Icon as={FiZap} boxSize={6} color="brand.400" />
            <Box>
              <Text fontWeight="bold" letterSpacing="0.08em">
                TONRODY
              </Text>
              <Text fontSize="xs" color="gray.400">
                Honest pulse rounds
              </Text>
            </Box>
          </HStack>
          <HStack spacing={{ base: 2, md: 4 }} flexWrap="wrap" justify="flex-end">
            <HStack
              spacing={{ base: 1, md: 3 }}
              overflowX="auto"
              py={{ base: 1, md: 0 }}
              px={{ base: 1, md: 0 }}
              borderRadius="full"
              bg="blackAlpha.200"
              backdropFilter="blur(8px)"
              whiteSpace="nowrap"
            >
              {APP_TABS.map((tab) => (
                <NavLink key={tab.path} to={tab.path} end={tab.path === '/'}>
                  {({ isActive }) => (
                    <Button
                      variant={isActive ? 'solid' : 'ghost'}
                      size="sm"
                      px={{ base: 3, md: 4 }}
                      fontSize="sm"
                    >
                      {tab.label}
                    </Button>
                  )}
                </NavLink>
              ))}
            </HStack>
            <TonConnectButton />
          </HStack>
        </Flex>
        <Box
          as="main"
          flex="1"
          px={{ base: 4, md: 10 }}
          py={{ base: 6, md: 10 }}
          maxW="1200px"
          mx="auto"
          w="full"
          display="flex"
          flexDirection="column"
          gap={6}
        >
          <Outlet />
        </Box>
      </Flex>
    </Box>
  );
}
