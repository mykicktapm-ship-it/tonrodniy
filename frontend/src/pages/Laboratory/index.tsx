import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Divider,
  Grid,
  HStack,
  Progress,
  Skeleton,
  Stack,
  Text,
  VStack
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageSection } from '../../components/PageSection';
import { StatusBadge } from '../../components/StatusBadge';
import { fetchOnchainRoundState, OnchainRoundState } from '../../lib/api';
import { TON_CONTRACT_ADDRESS } from '../../lib/constants';
import { useLobbiesQuery, useRoundsQuery } from '../../hooks/useLobbyData';

const formatTelemetryTimestamp = (value?: string) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

export default function LaboratoryPage() {
  const navigate = useNavigate();
  const { data: lobbies, isLoading: isLobbiesLoading } = useLobbiesQuery();
  const { data: rounds, isLoading: isRoundsLoading } = useRoundsQuery();
  const [onchainTelemetry, setOnchainTelemetry] = useState<OnchainRoundState | null>(null);
  const [isTelemetryLoading, setIsTelemetryLoading] = useState(false);

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
          <Text fontSize="sm" color="gray.400">
            Stakes are dispatched via Ton Connect directly from each participant’s wallet. The backend never proxies funds
            through an operator account.
          </Text>
        </VStack>
      </PageSection>

      <PageSection
        title="On-chain telemetry"
        description="Realtime view of the tonClient round-state getter used for audits."
      >
        <Stack spacing={4}>
          {onchainTelemetry && (
            <Alert status={onchainTelemetry.isFallback ? 'warning' : 'success'} variant="left-accent">
              <AlertIcon />
              {onchainTelemetry.isFallback
                ? onchainTelemetry.fallbackReason ?? 'TON RPC unavailable — showing fallback data.'
                : 'On-chain data confirmed.'}
            </Alert>
          )}
          <Stack spacing={3}>
            <HStack justify="space-between">
              <Text color="gray.400">Round ID</Text>
              <Text fontFamily="mono" fontSize="sm">
                {onchainTelemetry?.roundId ?? '—'}
              </Text>
            </HStack>
            <HStack justify="space-between" align="flex-start">
              <Text color="gray.400">Last round hash</Text>
              <Text fontFamily="mono" fontSize="xs" maxW="60%" textAlign="right" noOfLines={2}>
                {onchainTelemetry?.lastRoundHash ?? '—'}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text color="gray.400">On-chain balance</Text>
              <Text fontFamily="mono">
                {onchainTelemetry
                  ? `${onchainTelemetry.onChainBalanceTon.toFixed(2)} TON`
                  : '—'}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text color="gray.400">Locked stake</Text>
              <Text fontFamily="mono">
                {onchainTelemetry
                  ? `${onchainTelemetry.lockedStakeTon.toFixed(2)} TON`
                  : '—'}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text color="gray.400">Seats paid</Text>
              <Text fontFamily="mono">
                {onchainTelemetry
                  ? `${onchainTelemetry.seatsPaid} / ${onchainTelemetry.seatsTotal}`
                  : '—'}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text color="gray.400">Last event</Text>
              <Text fontFamily="mono" fontSize="sm">
                {onchainTelemetry?.lastEventType ?? '—'}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text color="gray.400">Updated at</Text>
              <Text fontFamily="mono" fontSize="sm">
                {formatTelemetryTimestamp(onchainTelemetry?.updatedAt)}
              </Text>
            </HStack>
          </Stack>
          <HStack justify="space-between">
            <Text color="gray.400">TON contract</Text>
            <Text fontFamily="mono" fontSize="sm">
              {TON_CONTRACT_ADDRESS}
            </Text>
          </HStack>
          {isTelemetryLoading && (
            <Text fontSize="sm" color="gray.500">
              Fetching latest telemetry…
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
