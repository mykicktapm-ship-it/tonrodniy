import {
  Box,
  Button,
  Divider,
  Grid,
  HStack,
  Progress,
  Skeleton,
  Stack,
  Text,
  VStack,
  useToast
} from '@chakra-ui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageSection } from '../../components/PageSection';
import { StatusBadge } from '../../components/StatusBadge';
import { fetchOnchainRoundState, OnchainRoundState } from '../../lib/api';
import { TON_CONTRACT_ADDRESS } from '../../lib/constants';
import { useLobbiesQuery, useRoundsQuery } from '../../hooks/useLobbyData';
import { sendStakeTransaction } from '../../services/apiClient';

export default function LaboratoryPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { data: lobbies, isLoading: isLobbiesLoading } = useLobbiesQuery();
  const { data: rounds, isLoading: isRoundsLoading } = useRoundsQuery();
  const [isSending, setIsSending] = useState(false);
  const [onchainTelemetry, setOnchainTelemetry] = useState<OnchainRoundState | null>(null);
  const [isTelemetryLoading, setIsTelemetryLoading] = useState(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const toastIdRef = useRef<string | number | undefined>(undefined);

  const telemetryLobbyId = useMemo(() => lobbies?.[0]?.id ?? 'laboratory-telemetry-lobby', [lobbies]);

  useEffect(() => {
    let isActive = true;
    if (!telemetryLobbyId) {
      return () => {
        isActive = false;
      };
    }
    setIsTelemetryLoading(true);
    fetchOnchainRoundState(telemetryLobbyId)
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
        setTelemetryError(error instanceof Error ? error.message : 'Unexpected error fetching round telemetry');
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
  }, [telemetryLobbyId]);

  const handleSendTonSubmission = useCallback(async () => {
    if (isSending || !lobbies?.length) {
      return;
    }
    const lobby = lobbies[0];
    setIsSending(true);
    toastIdRef.current = toast({
      title: 'Dispatching tonClient transaction…',
      description: `Funding ${lobby.lobbyCode}`,
      status: 'info',
      duration: null,
      isClosable: false
    });
    try {
      const submission = await sendStakeTransaction({
        lobbyId: lobby.id,
        seatId: lobby.seats[0]?.id ?? `${lobby.id}-lab-seat`,
        participantWallet: lobby.roundWallet,
        amountTon: lobby.stake
      });
      toast.update(toastIdRef.current!, {
        title: 'tonClient submission sent',
        description: `tx ${submission.txHash.slice(0, 10)}…`,
        status: 'success',
        duration: 4000,
        isClosable: true
      });
    } catch (error) {
      toast.update(toastIdRef.current!, {
        title: 'Submission failed',
        description: error instanceof Error ? error.message : 'Unexpected error',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    } finally {
      toastIdRef.current = undefined;
      setIsSending(false);
    }
  }, [isSending, lobbies, toast]);

  return (
    <Stack spacing={8}>
      <PageSection
        title="Laboratory"
        description="Operator dashboard for auditing lobby lifecycle and tonClient submissions."
      >
        <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={6}>
          <Stack spacing={4}>
            {isLobbiesLoading ? (
              <Skeleton height="160px" />
            ) : (
              lobbies?.map((lobby) => (
                <Box key={lobby.id} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={5}>
                  <HStack justify="space-between">
                    <Text fontWeight="bold">{lobby.lobbyCode}</Text>
                    <StatusBadge status={lobby.status as any} />
                  </HStack>
                  <Text fontSize="sm" color="gray.400">
                    {lobby.seatsTotal} seats · {lobby.stake} TON stake
                  </Text>
                  <Progress
                    value={lobby.seatsTotal ? (lobby.paidSeats / lobby.seatsTotal) * 100 : 0}
                    size="sm"
                    mt={4}
                    borderRadius="full"
                  />
                  <HStack mt={4} spacing={3}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => lobby.currentRoundId && navigate(`/rounds/${lobby.currentRoundId}`)}
                      isDisabled={!lobby.currentRoundId}
                    >
                      Inspect proof
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleSendTonSubmission} isLoading={isSending}>
                      Trigger tonClient
                    </Button>
                  </HStack>
                </Box>
              ))
            )}
          </Stack>
          <Stack spacing={4}>
            <Text fontWeight="bold">Recent rounds</Text>
            {isRoundsLoading ? (
              <Skeleton height="120px" />
            ) : (
              rounds?.slice(0, 4).map((round) => (
                <Box key={round.id} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={4}>
                  <Text fontWeight="semibold">Round #{round.roundNumber}</Text>
                  <Text fontSize="sm" color="gray.400">
                    Hash: {round.roundHash ?? '—'}
                  </Text>
                  <Text fontSize="sm" color="gray.400">
                    Winner: {round.winnerWallet ?? 'Pending'}
                  </Text>
                  <Button mt={3} size="sm" onClick={() => navigate(`/rounds/${round.id}`)}>
                    View details
                  </Button>
                </Box>
              ))
            )}
          </Stack>
        </Grid>
      </PageSection>

      <PageSection title="round_wallet" description="Operational wallet telemetry">
        <VStack spacing={4} align="stretch">
          <HStack justify="space-between">
            <Text>Wallet address</Text>
            <Text fontFamily="mono" fontSize="sm">
              {TON_CONTRACT_ADDRESS}
            </Text>
          </HStack>
          <Divider borderColor="whiteAlpha.200" />
          <Button onClick={handleSendTonSubmission} isLoading={isSending} loadingText="Sending">
            Send tonClient transaction
          </Button>
        </VStack>
      </PageSection>

      <PageSection
        title="On-chain telemetry"
        description="Realtime view of the tonClient round-state getter used for audits."
      >
        <Stack spacing={3}>
          <Stack spacing={2}>
            <HStack justify="space-between">
              <Text color="gray.400">Round hash</Text>
              <Text fontFamily="mono" fontSize="sm">
                {onchainTelemetry?.roundHash ?? '—'}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text color="gray.400">Winner index</Text>
              <Text fontFamily="mono">{onchainTelemetry ? onchainTelemetry.winnerIndex : '—'}</Text>
            </HStack>
            <HStack justify="space-between">
              <Text color="gray.400">Pool amount</Text>
              <Text fontFamily="mono">
                {onchainTelemetry?.poolAmount != null ? `${onchainTelemetry.poolAmount.toFixed(2)} TON` : '—'}
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

      <PageSection title="Commit → Reveal proof" description="Seed commitments for every lobby.">
        <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4}>
          {lobbies?.map((lobby) => (
            <Box key={lobby.id} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={4}>
              <Text fontWeight="semibold">{lobby.lobbyCode}</Text>
              <Text fontSize="xs" color="gray.500" mt={2}>
                Commit
              </Text>
              <Text fontFamily="mono" fontSize="sm" noOfLines={1}>
                {lobby.seedCommit}
              </Text>
              <Text fontSize="xs" color="gray.500" mt={3}>
                Reveal
              </Text>
              <Text fontFamily="mono" fontSize="sm" noOfLines={1}>
                {lobby.seedReveal ?? 'Pending'}
              </Text>
            </Box>
          ))}
        </Grid>
      </PageSection>
    </Stack>
  );
}
