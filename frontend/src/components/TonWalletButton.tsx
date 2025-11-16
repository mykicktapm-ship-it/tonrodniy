import { Button, HStack, Spinner, Text, Tooltip } from '@chakra-ui/react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { useCallback, useMemo, useState } from 'react';
import { truncateAddress } from '../lib/ton';

export function TonWalletButton() {
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusLabel = useMemo(() => {
    if (wallet) {
      return `Connected • ${truncateAddress(wallet.account.address)}`;
    }
    if (isConnecting) {
      return 'Connecting…';
    }
    return 'Connect wallet';
  }, [isConnecting, wallet]);

  const handleClick = useCallback(async () => {
    if (wallet) {
      tonConnectUI.disconnect();
      return;
    }
    setError(null);
    setIsConnecting(true);
    try {
      await tonConnectUI.openModal();
    } catch (err) {
      setError('Connection cancelled or failed.');
    } finally {
      setIsConnecting(false);
    }
  }, [tonConnectUI, wallet]);

  return (
    <Tooltip label={error ?? ''} isDisabled={!error} hasArrow>
      <Button
        size="sm"
        variant={wallet ? 'solid' : 'outline'}
        colorScheme={wallet ? 'purple' : undefined}
        onClick={handleClick}
        leftIcon={isConnecting ? <Spinner size="xs" /> : undefined}
      >
        <HStack spacing={2}>
          <Text fontSize="sm">{statusLabel}</Text>
        </HStack>
      </Button>
    </Tooltip>
  );
}
