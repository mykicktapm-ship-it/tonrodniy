import {
  Box,
  Button,
  Grid,
  GridItem,
  HStack,
  Progress,
  Skeleton,
  Stack,
  Stat,
  StatLabel,
  StatNumber,
  Text,
  useToast
} from '@chakra-ui/react';
import { useMemo, useCallback } from 'react';
import { PageSection } from '../../components/PageSection';
import { StatusBadge } from '../../components/StatusBadge';
import { useLobbiesQuery } from '../../hooks/useLobbyData';
import { useConnectedUser } from '../../hooks/useConnectedUser';
import { useWalletStore } from '../../stores/walletStore';
import { useMutation, useQueryClient } from '../../lib/queryClient';
import { joinLobby, payForSeat, sendStakeTransaction, type LobbySeat } from '../../lib/api';
import { useLobbyChannel } from '../../hooks/useLobbyChannel';
import { syncSeatAcrossCaches } from '../../lib/lobbyUtils';
import { TON_CONTRACT_ADDRESS } from '../../lib/constants';

const formatSeatLabel = (seat: LobbySeat) => {
  if (seat.status === 'paid') {
    return `Seat #${seat.seatIndex + 1} paid`;
  }
  if (seat.status === 'taken') {
    return `Seat #${seat.seatIndex + 1} reserved`;
  }
  return `Seat #${seat.seatIndex + 1} open`;
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
  const { connect, status: walletStatus, address } = useWalletStore((state) => ({
    connect: state.connect,
    status: state.status,
    address: state.address
  }));
  const queryClient = useQueryClient();

  const activeLobby = useMemo(() => {
    if (!lobbies?.length) {
      return undefined;
    }
    return lobbies.find((lobby) => lobby.status !== 'archived') ?? lobbies[0];
  }, [lobbies]);

  useLobbyChannel(activeLobby?.id);

  const mySeat = useMemo(() => {
    if (!activeLobby || !userProfile?.id) {
      return undefined;
    }
    return activeLobby.seats.find((seat) => seat.userId === userProfile.id && seat.status !== 'free');
  }, [activeLobby, userProfile?.id]);

  const activityFeed = useMemo(() => {
    if (!activeLobby) {
      return [];
    }
    return [...activeLobby.seats]
      .filter((seat) => seat.status !== 'free')
      .sort((a, b) => {
        const tsA = Date.parse(a.paidAt ?? a.reservedAt ?? '');
        const tsB = Date.parse(b.paidAt ?? b.reservedAt ?? '');
        return (Number.isNaN(tsB) ? 0 : tsB) - (Number.isNaN(tsA) ? 0 : tsA);
      });
  }, [activeLobby]);

  const joinMutation = useMutation({
    mutationFn: async ({ lobbyId, userId }: { lobbyId: string; userId: string }) => joinLobby(lobbyId, userId),
    onSuccess: (result, variables) => {
      syncSeatAcrossCaches(queryClient, variables.lobbyId, result.seat);
    }
  });

  const payMutation = useMutation({
    mutationFn: async ({ lobbyId, seatId, txHash }: { lobbyId: string; seatId: string; txHash: string }) =>
      payForSeat(lobbyId, seatId, txHash),
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
    if (!activeLobby || !mySeat) {
      return;
    }
    const hasWallet = await requireWalletConnection();
    if (!hasWallet || !address) {
      return;
    }
    try {
      toast({
        title: 'Sending TON stake',
        description: 'Dispatching transaction via tonClient…',
        status: 'info',
        duration: 4000,
        isClosable: true
      });
      const submission = await sendStakeTransaction({
        lobbyId: activeLobby.id,
        seatId: mySeat.id,
        participantWallet: address,
        amountTon: activeLobby.stake
      });
      await payMutation.mutateAsync({ lobbyId: activeLobby.id, seatId: mySeat.id, txHash: submission.txHash });
      toast({
        title: 'Stake confirmed',
        description: `TX ${submission.txHash.slice(0, 10)}…`,
        status: 'success',
        duration: 5000,
        isClosable: true
      });
    } catch (error) {
      toast({
        title: 'Payment failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    }
  }, [activeLobby, address, mySeat, payMutation, requireWalletConnection, toast]);

  const isReserveDisabled = !activeLobby || joinMutation.isPending || walletStatus === 'connecting';
  const isPayDisabled = !activeLobby || !mySeat || mySeat.status === 'paid' || payMutation.isPending;
  const progressValue = activeLobby ? Math.min(100, (activeLobby.paidSeats / activeLobby.seatsTotal) * 100) : 0;

  return (
    <Stack spacing={8}>
      <PageSection
        title="Next Honest Round"
        description="Live lobby telemetry synchronized with the TONRODY backend."
      >
        <Grid templateColumns={{ base: '1fr', md: '2fr 1fr' }} gap={6}>
          <GridItem>
            <Stack spacing={4}>
              {isLobbiesLoading ? (
                <Skeleton height="24px" />
              ) : activeLobby ? (
                <>
                  <Text fontSize="sm" color="gray.400">
                    {activeLobby.paidSeats} paid / {activeLobby.seatsTotal} seats · {activeLobby.stake} TON stake
                  </Text>
                  <Progress value={progressValue} size="sm" colorScheme="purple" borderRadius="full" />
                  <Stack spacing={3}>
                    {activeLobby.seats.map((seat) => (
                      <HStack key={seat.id} justify="space-between">
                        <Text fontFamily="mono" fontSize="sm">
                          Seat #{seat.seatIndex + 1}{seat.userId ? ` · ${seat.userId.slice(0, 4)}…` : ''}
                        </Text>
                        <StatusBadge status={seat.status as any} />
                      </HStack>
                    ))}
                  </Stack>
                  <HStack spacing={3}>
                    <Button onClick={handleReserveSeat} isDisabled={isReserveDisabled} isLoading={joinMutation.isPending}>
                      Reserve seat
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handlePayStake}
                      isDisabled={isPayDisabled}
                      isLoading={payMutation.isPending}
                    >
                      Pay stake
                    </Button>
                  </HStack>
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
                {activeLobby?.roundHash ?? '—'}
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
              <HStack key={seat.id} justify="space-between">
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
            { label: 'Seed commit', value: activeLobby?.seedCommit ?? '—', helper: 'Published before the lobby opens.' },
            {
              label: 'Collect stakes',
              value: `${activeLobby?.paidSeats ?? 0}/${activeLobby?.seatsTotal ?? 0} paid`,
              helper: 'Wallet + TON client confirm each payment.'
            },
            {
              label: 'Seed reveal',
              value: activeLobby?.seedReveal ?? 'Pending',
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
