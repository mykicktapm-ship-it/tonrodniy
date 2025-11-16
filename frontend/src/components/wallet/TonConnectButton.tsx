import { Button, HStack, Icon, Text, Tooltip } from '@chakra-ui/react';
import { FiLink2 } from 'react-icons/fi';
import { useTonConnectContext } from '../../providers/TonConnectUIProvider';

function shortAddress(address: string) {
  if (address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function TonConnectButton() {
  const { wallet, status, isRestoring, isBusy, error, openModal, disconnect, retry } = useTonConnectContext();
  const isLoading = status === 'loading' || isRestoring || isBusy;
  const isConnected = Boolean(wallet);
  const colorScheme = error ? 'red' : isConnected ? 'green' : 'blue';
  const variant = isConnected ? 'solid' : 'outline';
  const handleClick = async () => {
    if (error) {
      retry();
      return;
    }

    if (isConnected) {
      await disconnect();
      return;
    }

    await openModal();
  };

  const tooltipLabel = error || (wallet?.device?.appName && `Connected via ${wallet.device.appName}`) || undefined;

  return (
    <Tooltip label={tooltipLabel} isDisabled={!tooltipLabel} hasArrow>
      <Button
        size="sm"
        colorScheme={colorScheme}
        variant={variant}
        onClick={handleClick}
        isLoading={isLoading}
        loadingText={isConnected ? 'Disconnecting' : 'Connecting'}
        leftIcon={<Icon as={FiLink2} />}
      >
        <HStack spacing={2}>
          <Text color="currentColor" fontWeight="semibold">
            {error ? 'Retry connection' : isConnected ? shortAddress(wallet!.account.address) : 'Connect wallet'}
          </Text>
          {!error && isConnected && wallet?.device?.appName && (
            <Text fontSize="xs" opacity={0.8} color="currentColor">
              {wallet.device.appName}
            </Text>
          )}
        </HStack>
      </Button>
    </Tooltip>
  );
}
