import { Avatar, Box, Button, HStack, Skeleton, Stack, Text } from '@chakra-ui/react';
import { PageSection } from '../../components/PageSection';
import { useConnectedUser } from '../../hooks/useConnectedUser';
import { useUserLogs } from '../../hooks/useUserLogs';
import { useWalletStore } from '../../stores/walletStore';

const formatTimestamp = (value?: string) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

export default function ProfilePage() {
  const { data: user, status: userStatus, error: userError } = useConnectedUser();
  const { connect, disconnect, status: walletStatus, address } = useWalletStore((state) => ({
    connect: state.connect,
    disconnect: state.disconnect,
    status: state.status,
    address: state.address
  }));
  const { data: logs, isLoading: areLogsLoading } = useUserLogs(user?.id);

  const isConnected = walletStatus === 'connected' && Boolean(address);
  const userErrorMessage =
    userStatus === 'error'
      ? userError instanceof Error
        ? userError.message
        : userError
          ? String(userError)
          : null
      : null;
  const handlePrimaryAction = async () => {
    if (isConnected) {
      await disconnect();
    } else {
      await connect();
    }
  };

  return (
    <Stack spacing={8}>
      <PageSection title="Wallet connect" description="TON Connect session with linked profile metadata.">
        <Stack spacing={4}>
          <HStack align={{ base: 'flex-start', sm: 'center' }} spacing={4} flexDir={{ base: 'column', sm: 'row' }}>
            <Avatar
              name={user?.username ?? user?.wallet ?? 'Wallet'}
              src={user?.avatarUrl}
              size="lg"
              bg="brand.500"
              color="white"
            />
            <Stack spacing={1} w="full">
              <Text fontWeight="bold">
                {user?.username ?? user?.wallet ?? 'No wallet connected'}
              </Text>
              <Text fontSize="sm" color="gray.400">
                Status: {isConnected ? 'connected' : walletStatus === 'connecting' ? 'connecting' : 'disconnected'}
              </Text>
              {user?.wallet && (
                <Text fontSize="xs" fontFamily="mono">
                  {user.wallet}
                </Text>
              )}
              {userErrorMessage && (
                <Text fontSize="xs" color="red.300">
                  {userErrorMessage}
                </Text>
              )}
            </Stack>
          </HStack>
          <Button
            w={{ base: 'full', sm: 'auto' }}
            onClick={handlePrimaryAction}
            isLoading={walletStatus === 'connecting'}
          >
            {isConnected ? 'Disconnect wallet' : 'Connect wallet'}
          </Button>
        </Stack>
      </PageSection>

      <PageSection title="Logs" description="Every lobby action linked to this wallet appears here.">
        {areLogsLoading ? (
          <Skeleton height="140px" />
        ) : logs && logs.length > 0 ? (
          <Stack spacing={3}>
            {logs.map((log) => (
              <Box key={log.id} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={4}>
                <Text fontWeight="semibold">{log.action}</Text>
                <Text fontSize="sm" color="gray.400">
                  {formatTimestamp(log.createdAt)} · {log.status ?? 'pending'}
                </Text>
                {log.amountTon != null && (
                  <Text fontSize="sm" color="gray.300">
                    Amount: {log.amountTon.toFixed(2)} TON
                  </Text>
                )}
                {log.txHash && (
                  <Text fontSize="xs" fontFamily="mono" mt={2} color="gray.500">
                    TX {log.txHash}
                  </Text>
                )}
              </Box>
            ))}
          </Stack>
        ) : (
          <Text color="gray.500">No actions recorded for this wallet yet.</Text>
        )}
      </PageSection>
    </Stack>
  );
}
