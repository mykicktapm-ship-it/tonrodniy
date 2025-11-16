import {
  Box,
  Flex,
  HStack,
  Icon,
  Text,
  Button,
  useColorModeValue,
} from '@chakra-ui/react';
import { NavLink, Outlet } from 'react-router-dom';
import { APP_TABS } from '../lib/constants';
import { FiZap } from 'react-icons/fi';

export function AppLayout() {
  const borderColor = useColorModeValue('blackAlpha.200', 'whiteAlpha.200');

  return (
    <Flex direction="column" minH="100vh">
      <Flex
        as="header"
        align="center"
        justify="space-between"
        px={{ base: 4, md: 10 }}
        py={4}
        borderBottomWidth="1px"
        borderColor={borderColor}
        bg="rgba(7, 12, 24, 0.92)"
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
        <HStack spacing={{ base: 1, md: 3 }}>
          {APP_TABS.map((tab) => (
            <NavLink key={tab.path} to={tab.path} end={tab.path === '/'}>
              {({ isActive }) => (
                <Button
                  variant={isActive ? 'solid' : 'ghost'}
                  size="sm"
                  px={4}
                  fontSize="sm"
                >
                  {tab.label}
                </Button>
              )}
            </NavLink>
          ))}
        </HStack>
      </Flex>
      <Box as="main" flex="1" px={{ base: 4, md: 10 }} py={10} maxW="1200px" mx="auto" w="full">
        <Outlet />
      </Box>
    </Flex>
  );
}
