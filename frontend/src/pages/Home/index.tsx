import {
  Box,
  Button,
  Grid,
  GridItem,
  HStack,
  Progress,
  Skeleton,
  SkeletonText,
  Stack,
  Stat,
  StatLabel,
  StatNumber,
  Text,
  useToast
} from '@chakra-ui/react';
import { useMemo, useCallback, useState, useEffect } from 'react';
import { PageSection } from '../../components/PageSection';
import { StatusBadge } from '../../components/StatusBadge';
import { useLobbiesQuery } from '../../hooks/useLobbyData';
import { useConnectedUser } from '../../hooks/useConnectedUser';
import { useWalletStore } from '../../stores/walletStore';
import { useMutation, useQueryClient } from '../../lib/queryClient';
import { joinLobby, payForSeat, type LobbySeat, type LobbySummary } from '../../lib/api';
import { useLobbyChannel } from '../../hooks/useLobbyChannel';
import { syncSeatAcrossCaches } from '../../lib/lobbyUtils';
import { sendStakeViaTonConnect } from '../../lib/tonConnect';
import { TON_CONTRACT_ADDRESS } from '../../lib/constants';

const formatSeatLabel = (seat: LobbySeat) => {
  switch (seat.status) {
    case 'paid':
      return `Seat #${seat.seatIndex + 1} paid`;
    case 'pending_payment':
      return `Seat #${seat.seatIndex + 1} awaiting confirmation`;
    case 'taken':
      return `Seat #${seat.seatIndex + 1} reserved`;
    case 'failed':
      return `Seat #${seat.seatIndex + 1} payment failed`;
    default:
      return `Seat #${seat.seatIndex + 1} open`;
  }
};

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

export default function HomePage() {
  const toast = useToast();
  const { data: lobbies, isLoading: isLobbiesLoading } = useLobbiesQuery();
  const { data: userProfile, status: userStatus, error: userError } = useConnectedUser();
  const { connect, status: walletStatus, address, controller } = useWalletStore((state) => ({
    connect: state.connect,
    status: state.status,
    address: state.address,
    controller: state.controller
  }));
  const queryClient = useQueryClient();

  const activeLobby = useMemo(() => {
    if (!lobbies?.length) {
      return undefined;
    }
    return lobbies.find((lobby) => lobby.status !== 'archived') ?? lobbies[0];
  }, [lobbies]);

  const [persistedLobby, setPersistedLobby] = useState<LobbySummary | undefined>();

  useEffect(() => {
    if (activeLobby) {
      setPersistedLobby(activeLobby);
    }
  }, [activeLobby]);

  const displayLobby = activeLobby ?? persistedLobby;

  useLobbyChannel(activeLobby?.id);

  const [stakeUiState, setStakeUiState] = useState<'idle' | 'awaiting_signature' | 'submitted' | 'rejected' | 'error'>('idle');
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  const mySeat = useMemo(() => {
    if (!activeLobby || !userProfile?.id) {
      return undefined;
    }
    return activeLobby.seats.find((seat) => seat.userId === userProfile.id && seat.status !== 'free');
  }, [activeLobby, userProfile?.id]);

  const activityFeed = useMemo(() => {
    if (!displayLobby) {
      return [];
    }
    return [...displayLobby.seats]
      .filter((seat) => seat.status !== 'free')
      .sort((a, b) => {
        const tsA = Date.parse(a.paidAt ?? a.reservedAt ?? '');
        const tsB = Date.parse(b.paidAt ?? b.reservedAt ?? '');
        return (Number.isNaN(tsB) ? 0 : tsB) - (Number.isNaN(tsA) ? 0 : tsA);
      });
  }, [displayLobby]);

  const stakeStatusMessage = useMemo(() => {
    switch (stakeUiState) {
      case 'awaiting_signature':
        return 'Waiting for wallet signature…';
      case 'submitted':
        return lastTxHash
          ? `Submitted ${lastTxHash.slice(0, 10)}…, awaiting TON confirmation.`
          : 'Transaction submitted, awaiting TON confirmation.';
      case 'rejected':
        return 'Signature rejected in wallet.';
      case 'error':
        return 'Payment failed before reaching TON.';
      default:
        return null;
    }
  }, [lastTxHash, stakeUiState]);

  const stakeStatusColor = useMemo(() => {
    switch (stakeUiState) {
      case 'awaiting_signature':
        return 'blue.300';
      case 'submitted':
        return 'yellow.300';
      case 'rejected':
        return 'orange.300';
      case 'error':
        return 'red.300';
      default:
        return 'gray.400';
    }
  }, [stakeUiState]);

  const joinMutation = useMutation({
    mutationFn: async ({ lobbyId, userId }: { lobbyId: string; userId: string }) => joinLobby(lobbyId, userId),
    onSuccess: (result, variables) => {
      syncSeatAcrossCaches(queryClient, variables.lobbyId, result.seat);
    }
  });

  const payMutation = useMutation({
    mutationFn: async ({
      lobbyId,
      seatId,
      txHash,
      userId
    }: {
      lobbyId: string;
      seatId: string;
      txHash: string;
      userId: string;
    }) => payForSeat(lobbyId, seatId, txHash, userId),
    onSuccess: (result, variables) => {
      syncSeatAcrossCaches(queryClient, variables.lobbyId, result.seat);
    }
  });

  const requireWalletConnection = useCallback(async () => {
    if (walletStatus === 'connected' && address) {
      return true;
    }
    await connect();
    return false;
  }, [address, connect, walletStatus]);

  const handleReserveSeat = useCallback(async () => {
    if (!activeLobby) {
      return;
    }
    const hasWallet = await requireWalletConnection();
    if (!hasWallet || !userProfile?.id) {
      if (userStatus === 'success' && !userProfile?.id) {
        toast({
          title: 'Wallet not linked',
          description: 'No TONRODY profile is associated with this wallet yet.',
          status: 'warning',
          duration: 6000,
          isClosable: true
        });
      }
      return;
    }
    try {
      await joinMutation.mutateAsync({ lobbyId: activeLobby.id, userId: userProfile.id });
      toast({
        title: 'Seat reserved',
        description: 'Complete the stake before the timer expires.',
        status: 'success',
        duration: 4000,
        isClosable: true
      });
    } catch (error) {
      toast({
        title: 'Failed to reserve seat',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    }
  }, [activeLobby, joinMutation, requireWalletConnection, toast, userProfile?.id, userStatus]);

  const handlePayStake = useCallback(async () => {
    if (!activeLobby || !mySeat || !userProfile?.id) {
      return;
    }
    const hasWallet = await requireWalletConnection();
    if (!hasWallet || !address) {
      return;
    }
    if (!controller) {
      toast({
        title: 'TonConnect unavailable',
        description: 'Wallet controller is not ready yet.',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
      return;
    }
    setStakeUiState('awaiting_signature');
    setLastTxHash(null);
    try {
      const { txHash } = await sendStakeViaTonConnect({
        controller,
        lobbyId: activeLobby.id,
        seatId: mySeat.id,
        seatIndex: mySeat.seatIndex,
        stakeTon: activeLobby.stake,
        userId: userProfile.id
      });
      setLastTxHash(txHash);
      setStakeUiState('submitted');
      const result = await payMutation.mutateAsync({
        lobbyId: activeLobby.id,
        seatId: mySeat.id,
        txHash,
        userId: userProfile.id
      });
      const confirmed = result.status === 'confirmed';
      setStakeUiState(confirmed ? 'idle' : 'submitted');
      toast({
        title: confirmed ? 'Stake confirmed' : 'Stake submitted',
        description: confirmed
          ? `TX ${txHash.slice(0, 10)}…`
          : 'Waiting for TON confirmation…',
        status: confirmed ? 'success' : 'info',
        duration: confirmed ? 5000 : 4000,
        isClosable: true
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const rejected = /reject/i.test(message);
      setStakeUiState(rejected ? 'rejected' : 'error');
      toast({
        title: rejected ? 'Signature rejected' : 'Payment failed',
        description: message,
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    }
  }, [activeLobby, address, controller, mySeat, payMutation, requireWalletConnection, toast, userProfile?.id]);

  const isReserveDisabled = !activeLobby || joinMutation.isPending || walletStatus === 'connecting';
  const isPayDisabled =
    !activeLobby ||
    !mySeat ||
    mySeat.status === 'paid' ||
    payMutation.isPending ||
    stakeUiState === 'awaiting_signature';
  const progressValue = displayLobby ? Math.min(100, (displayLobby.paidSeats / displayLobby.seatsTotal) * 100) : 0;

  return (
    <Stack spacing={8}>
      <PageSection
        title="Next Honest Round"
        description="Live lobby telemetry synchronized with the TONRODY backend."
      >
        <Grid templateColumns={{ base: '1fr', md: '2fr 1fr' }} gap={6}>
          <GridItem>
            <Stack spacing={4}>
              {isLobbiesLoading && !displayLobby ? (
                <Stack spacing={3}>
                  <Skeleton height="16px" w="60%" />
                  <Skeleton height="10px" w="90%" />
                  <SkeletonText mt={4} noOfLines={6} spacing={2} />
                  <Skeleton height="40px" w="full" />
                </Stack>
              ) : displayLobby ? (
                <>
                  <Text fontSize="sm" color="gray.400">
                    {displayLobby.paidSeats} paid / {displayLobby.seatsTotal} seats · {displayLobby.stake} TON stake
                  </Text>
                  <Progress value={progressValue} size="sm" colorScheme="purple" borderRadius="full" />
                  <Stack spacing={3}>
                    {displayLobby.seats.map((seat) => (
                      <HStack
                        key={seat.id}
                        justify="space-between"
                        align={{ base: 'flex-start', sm: 'center' }}
                        flexDir={{ base: 'column', sm: 'row' }}
                        gap={{ base: 1, sm: 3 }}
                      >
                        <Text fontFamily="mono" fontSize="sm" w="full">
                          Seat #{seat.seatIndex + 1}{seat.userId ? ` · ${seat.userId.slice(0, 4)}…` : ''}
                        </Text>
                        <StatusBadge status={seat.status as any} />
                      </HStack>
                    ))}
                  </Stack>
                  <HStack spacing={3} flexWrap={{ base: 'wrap', sm: 'nowrap' }}>
                    <Button
                      onClick={handleReserveSeat}
                      isDisabled={isReserveDisabled}
                      isLoading={joinMutation.isPending}
                      w={{ base: 'full', sm: 'auto' }}
                    >
                      Reserve seat
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handlePayStake}
                      isDisabled={isPayDisabled}
                      isLoading={payMutation.isPending}
                      w={{ base: 'full', sm: 'auto' }}
                    >
                      Pay stake
                    </Button>
                  </HStack>
                  {stakeStatusMessage && (
                    <Text fontSize="sm" color={stakeStatusColor}>
                      {stakeStatusMessage}
                    </Text>
                  )}
                  {userError && walletStatus === 'connected' && (
                    <Text fontSize="sm" color="orange.300">
                      {userError instanceof Error ? userError.message : 'Unable to resolve wallet profile'}
                    </Text>
                  )}
                </>
              ) : (
                <Text color="gray.400">No active lobbies yet.</Text>
              )}
            </Stack>
          </GridItem>
          <GridItem>
            <Stat>
              <StatLabel>Round hash</StatLabel>
              <StatNumber fontSize="lg" fontFamily="mono">
                <Text as="span" wordBreak="break-word">
                  {displayLobby?.roundHash ?? '—'}
                </Text>
              </StatNumber>
              <Text fontSize="sm" color="gray.400" mt={2}>
                Hash and stake are signed by the operator wallet {TON_CONTRACT_ADDRESS.slice(0, 10)}…
              </Text>
            </Stat>
          </GridItem>
        </Grid>
      </PageSection>

      <PageSection title="Activity" description="Seat, payment, and fairness events from the active lobby.">
        {activityFeed.length === 0 ? (
          <Text color="gray.500">No seat activity yet.</Text>
        ) : (
          <Stack spacing={4}>
            {activityFeed.map((seat) => (
              <HStack
                key={seat.id}
                justify="space-between"
                align={{ base: 'flex-start', sm: 'center' }}
                flexDir={{ base: 'column', sm: 'row' }}
                gap={{ base: 1, sm: 3 }}
              >
                <Text>{formatSeatLabel(seat)}</Text>
                <Text color="gray.500" fontSize="sm">
                  {formatTimestamp(seat.paidAt ?? seat.reservedAt)}
                </Text>
              </HStack>
            ))}
          </Stack>
        )}
      </PageSection>

      <PageSection title="Fairness protocol" description="Commit → collect → reveal lifecycle.">
        <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={4}>
            {[
            { label: 'Seed commit', value: displayLobby?.seedCommit ?? '—', helper: 'Published before the lobby opens.' },
            {
              label: 'Collect stakes',
              value: `${displayLobby?.paidSeats ?? 0}/${displayLobby?.seatsTotal ?? 0} paid`,
              helper: 'Wallet + TON client confirm each payment.'
            },
            {
              label: 'Seed reveal',
              value: displayLobby?.seedReveal ?? 'Pending',
              helper: 'Revealed when the round finalizes.'
            }
          ].map((step) => (
            <Box key={step.label} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={4}>
              <Text fontWeight="bold">{step.label}</Text>
              <Text fontFamily="mono" fontSize="sm" mt={2}>
                {step.value}
              </Text>
              <Text fontSize="sm" color="gray.400" mt={2}>
                {step.helper}
              </Text>
            </Box>
          ))}
        </Grid>
      </PageSection>
    </Stack>
  );
}
