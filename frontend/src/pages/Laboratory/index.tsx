import {
  Box,
  Button,
  Divider,
  Grid,
  HStack,
  Progress,
  Stack,
  Text,
  VStack,
  useToast,
} from '@chakra-ui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PageSection } from '../../components/PageSection';
import { useMockRounds } from '../../hooks/useMockRounds';
import { StatusBadge } from '../../components/StatusBadge';
import { sendFakeTransaction } from '../../services/fakeTonService';
import { fetchOnchainRoundState, OnchainRoundState } from '../../lib/api';
import { TON_CONTRACT_ADDRESS } from '../../lib/constants';

export default function LaboratoryPage() {
  const rounds = useMockRounds();
  const toast = useToast();
  const toastIdRef = useRef<string | number | undefined>(undefined);
  const [isSending, setIsSending] = useState(false);
  const [onchainTelemetry, setOnchainTelemetry] = useState<OnchainRoundState | null>(null);
  const [isTelemetryLoading, setIsTelemetryLoading] = useState(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    const lobbyId = 'laboratory-telemetry-lobby';
    setIsTelemetryLoading(true);
    fetchOnchainRoundState(lobbyId)
      .then((state) => {
        if (!isActive) {
          return;
        }
        setOnchainTelemetry(state);
        setTelemetryError(null);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }
        console.warn('[LaboratoryPage] telemetry fetch failed', error);
        setTelemetryError(
          error instanceof Error ? error.message : 'Unexpected error fetching round telemetry',
        );
      })
      .finally(() => {
        if (!isActive) {
          return;
        }
        setIsTelemetryLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const handleSendMockTransaction = useCallback(async () => {
    if (isSending) {
      return;
    }

    setIsSending(true);
    const payload = {
      to: 'UQMockRoundWallet',
      amount: 1.5,
      comment: 'Laboratory funding simulation',
    };
    // TODO: swap out fake payload + service with real round contract interaction once ready
    toastIdRef.current = toast({
      title: 'Sending mock transaction…',
      description: 'Simulating TON funding request',
      status: 'info',
      duration: null,
      isClosable: false,
    });

    try {
      const response = await sendFakeTransaction(payload);
      console.debug('[LaboratoryPage] Mock transaction result', response);
      if (toastIdRef.current) {
        toast.update(toastIdRef.current, {
          title: 'Mock transaction confirmed',
          description: `Hash ${response.hash.slice(0, 10)}…`,
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      } else {
        toast({
          title: 'Mock transaction confirmed',
          description: `Hash ${response.hash.slice(0, 10)}…`,
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch (error) {
      const description =
        error instanceof Error ? error.message : 'Unexpected error while sending mock transaction';
      if (toastIdRef.current) {
        toast.update(toastIdRef.current, {
          title: 'Mock transaction failed',
          description,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      } else {
        toast({
          title: 'Mock transaction failed',
          description,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    } finally {
      toastIdRef.current = undefined;
      setIsSending(false);
    }
  }, [isSending, toast]);

  return (
    <Stack spacing={8}>
      <PageSection
        title="Laboratory"
        description="Prototype of the lobby system where operators can simulate seat allocation and fairness steps."
      >
        <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={6}>
          <Stack spacing={4}>
            {rounds.map((round) => (
              <Box key={round.id} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={5}>
                <HStack justify="space-between">
                  <Text fontWeight="bold">{round.lobby}</Text>
                  <StatusBadge status={round.state as any} />
                </HStack>
                <Text fontSize="sm" color="gray.400">
                  {round.seatCount} seats · {round.stake} TON mock stake
                </Text>
                <Progress value={round.state === 'collecting' ? 40 : 100} size="sm" mt={4} borderRadius="full" />
                <HStack mt={4} spacing={3}>
                  <Button size="sm" variant="outline">
                    Mock join
                  </Button>
                  <Button size="sm" variant="ghost">
                    Inspect hash
                  </Button>
                </HStack>
              </Box>
            ))}
          </Stack>
          <Stack spacing={4}>
            <Text fontWeight="bold">Round lifecycle</Text>
            {['Idle', 'Seats filling', 'Hash locked', 'Reveal'].map((phase, idx) => (
              <Stack key={phase} spacing={2}>
                <HStack justify="space-between">
                  <Text>{phase}</Text>
                  <Text color="gray.500" fontSize="sm">
                    {idx === 2 ? 'hash stored' : 'pending'}
                  </Text>
                </HStack>
                <Progress value={(idx + 1) * 20} size="xs" />
              </Stack>
            ))}
          </Stack>
        </Grid>
      </PageSection>

      <PageSection title="round_wallet mock" description="How collateral will be visualized">
        <VStack spacing={4} align="stretch">
          <HStack justify="space-between">
            <Text>Wallet balance (mock)</Text>
            <Text fontFamily="mono">23.41 TON</Text>
          </HStack>
          <Divider borderColor="whiteAlpha.200" />
          <Button onClick={handleSendMockTransaction} isLoading={isSending} loadingText="Sending">
            Send mock transaction
          </Button>
        </VStack>
      </PageSection>

      <PageSection
        title="On-chain telemetry"
        description="Realtime view of the round-state pull that will back the fairness audits."
      >
        <Stack spacing={3}>
          <Text fontSize="sm" color="gray.400">
            Data is mocked deterministically until the F5 release swaps this widget to live
            contract calls.
          </Text>
          <Stack spacing={2}>
            <HStack justify="space-between">
              <Text color="gray.400">Round hash</Text>
              <Text fontFamily="mono" fontSize="sm">
                {onchainTelemetry?.roundHash ?? '—'}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text color="gray.400">Winner index</Text>
              <Text fontFamily="mono">
                {onchainTelemetry ? onchainTelemetry.winnerIndex : '—'}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text color="gray.400">Pool amount</Text>
              <Text fontFamily="mono">
                {onchainTelemetry?.poolAmount != null
                  ? `${onchainTelemetry.poolAmount.toFixed(2)} TON`
                  : '—'}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text color="gray.400">TON contract</Text>
              <Text fontFamily="mono" fontSize="sm">
                {TON_CONTRACT_ADDRESS}
              </Text>
            </HStack>
          </Stack>
          {isTelemetryLoading && (
            <Text fontSize="sm" color="gray.500">
              Fetching latest telemetry…
            </Text>
          )}
          {telemetryError && (
            <Text fontSize="sm" color="red.300">
              {telemetryError}
            </Text>
          )}
        </Stack>
      </PageSection>
    </Stack>
  );
}
