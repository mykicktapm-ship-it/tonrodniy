import { Button, HStack, Icon, Text, Tooltip } from '@chakra-ui/react';
import { FiLink2 } from 'react-icons/fi';
import { useWalletStore } from '../../stores/walletStore';

function shortAddress(address: string) {
  if (address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function TonConnectButton() {
  const { address, status, wallet, connect, disconnect } = useWalletStore((state) => ({
    address: state.address,
    status: state.status,
    wallet: state.wallet,
    connect: state.connect,
    disconnect: state.disconnect,
  }));

  const isConnected = Boolean(address) && status === 'connected';
  const isLoading = status === 'connecting';
  const handleClick = async () => {
    if (isConnected) {
      await disconnect();
      return;
    }

    await connect();
  };

  const tooltipLabel = wallet?.device?.appName ? `Connected via ${wallet.device.appName}` : undefined;

  return (
    <Tooltip label={tooltipLabel} isDisabled={!tooltipLabel} hasArrow>
      <Button
        size="sm"
        colorScheme={isConnected ? 'green' : 'blue'}
        variant={isConnected ? 'solid' : 'outline'}
        onClick={handleClick}
        isLoading={isLoading}
        loadingText={isConnected ? 'Disconnecting' : 'Connecting'}
        leftIcon={<Icon as={FiLink2} />}
      >
        <HStack spacing={2}>
          <Text color="currentColor" fontWeight="semibold">
            {isConnected && address ? shortAddress(address) : 'Connect wallet'}
          </Text>
          {isConnected && wallet?.device?.appName && (
            <Text fontSize="xs" opacity={0.8} color="currentColor">
              {wallet.device.appName}
            </Text>
          )}
        </HStack>
      </Button>
    </Tooltip>
  );
}
