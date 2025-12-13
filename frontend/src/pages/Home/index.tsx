import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  Progress,
  Skeleton,
  Stack,
  Stat,
  StatLabel,
  StatNumber,
  Text,
  useToast,
  VStack
} from '@chakra-ui/react';
import { useMemo, useCallback, useState } from 'react';
import { PageSection } from '../../components/PageSection';
import { StatusBadge } from '../../components/StatusBadge';
import { useLobbiesQuery } from '../../hooks/useLobbyData';
import { useConnectedUser } from '../../hooks/useConnectedUser';
import { useWalletStore } from '../../stores/walletStore';
import { useMutation, useQueryClient } from '../../lib/queryClient';
import { joinLobby, payForSeat, type LobbySeat } from '../../lib/api';
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

  const userErrorMessage = useMemo(() => {
    if (!userError) {
      return null;
    }
    if (userError instanceof Error) {
      return userError.message;
    }
    return typeof userError === 'string' ? userError : 'Unable to resolve wallet profile';
  }, [userError]);

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
  const progressValue = activeLobby ? Math.min(100, (activeLobby.paidSeats / activeLobby.seatsTotal) * 100) : 0;

  return (
    <Stack spacing={6}>
      <Box
        borderWidth="1px"
        borderColor="whiteAlpha.200"
        borderRadius="2xl"
        bg="linear-gradient(140deg, rgba(9,12,22,0.92), rgba(5,7,12,0.92))"
        p={{ base: 5, md: 6 }}
        position="relative"
        overflow="hidden"
      >
        <Box
          position="absolute"
          inset={0}
          bgGradient="radial(at 85% 10%, rgba(79,216,255,0.15), transparent 40%)"
          opacity={0.9}
        />
        <Stack spacing={4} position="relative" zIndex={1}>
          <HStack spacing={3} align="center">
            <Badge colorScheme="cyan" borderRadius="full" px={3} py={1} textTransform="uppercase" fontWeight="700">
              Live lobby
            </Badge>
            <Text fontSize="xs" color="gray.400">
              Design inspired by docs/lobbies.html
            </Text>
          </HStack>
          {isLobbiesLoading ? (
            <Skeleton height="32px" />
          ) : activeLobby ? (
            <Stack spacing={4}>
              <Text fontSize="xl" fontWeight="bold" letterSpacing="0.02em">
                {activeLobby.lobbyCode ?? 'Active lobby'}
              </Text>
              <HStack spacing={2} flexWrap="wrap">
                <MetaChip label="Stake" value={`${activeLobby.stake} TON`} />
                <MetaChip label="Seats" value={`${activeLobby.paidSeats}/${activeLobby.seatsTotal}`} />
                <MetaChip label="Hash" value={(activeLobby.roundHash ?? '—').slice(0, 14) + '…'} />
                <MetaChip label="round_wallet" value={TON_CONTRACT_ADDRESS.slice(0, 14) + '…'} />
              </HStack>
              <Progress value={progressValue} size="sm" colorScheme="cyan" borderRadius="full" bg="whiteAlpha.200" />
              <Flex gap={3} wrap="wrap">
                <Button
                  onClick={handleReserveSeat}
                  isDisabled={isReserveDisabled}
                  isLoading={joinMutation.isPending}
                >
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
                <Badge
                  colorScheme="purple"
                  px={3}
                  py={2}
                  borderRadius="lg"
                  bg="rgba(111,90,255,0.16)"
                  borderWidth="1px"
                  borderColor="whiteAlpha.200"
                >
                  Commit → Reveal protected
                </Badge>
              </Flex>
              {stakeStatusMessage && (
                <Text fontSize="sm" color={stakeStatusColor}>
                  {stakeStatusMessage}
                </Text>
              )}
              {userErrorMessage && walletStatus === 'connected' && (
                <Text fontSize="sm" color="orange.300">
                  {userErrorMessage}
                </Text>
              )}
            </Stack>
          ) : (
            <Text color="gray.400">No active lobbies yet.</Text>
          )}
        </Stack>
      </Box>

      <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={4}>
        <PageSection
          title="Seats and telemetry"
          description="Mirrors the pill-based lobby layout from docs/lobbies.html with live statuses."
        >
          {isLobbiesLoading ? (
            <Skeleton height="140px" />
          ) : activeLobby ? (
            <Stack spacing={3}>
              {activeLobby.seats.map((seat) => (
                <SeatRow key={seat.id} seat={seat} />
              ))}
            </Stack>
          ) : (
            <Text color="gray.500">No seats to display.</Text>
          )}
        </PageSection>

        <PageSection
          title="Round hash"
          description="Pulled from TON and signed by the operator wallet for auditability."
        >
          <Stat>
            <StatLabel color="gray.400">Commit hash</StatLabel>
            <StatNumber fontSize="lg" fontFamily="mono" wordBreak="break-all">
              {activeLobby?.roundHash ?? '—'}
            </StatNumber>
            <Text fontSize="sm" color="gray.400" mt={3}>
              Wallet {TON_CONTRACT_ADDRESS.slice(0, 18)}… anchors the commit. Copy this value to validate randomness at
              reveal time.
            </Text>
          </Stat>
        </PageSection>
      </Grid>

      <Grid templateColumns={{ base: '1fr', md: '1.2fr 0.8fr' }} gap={4}>
        <PageSection title="Pulse feed" description="Seat, payment, and fairness events from the active lobby.">
          {activityFeed.length === 0 ? (
            <Text color="gray.500">No seat activity yet.</Text>
          ) : (
            <Stack spacing={3}>
              {activityFeed.map((seat) => (
                <HStack
                  key={seat.id}
                  justify="space-between"
                  align={{ base: 'flex-start', sm: 'center' }}
                  flexDir={{ base: 'column', sm: 'row' }}
                  gap={{ base: 2, sm: 4 }}
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

        <PageSection title="Fairness protocol" description="Commit → collect → reveal lifecycle." >
          <Grid templateColumns={{ base: '1fr', sm: 'repeat(2, 1fr)' }} gap={3}>
            {[
              { label: 'Seed commit', value: activeLobby?.seedCommit ?? '—', helper: 'Published before the lobby opens.' },
              {
                label: 'Collect stakes',
                value: `${activeLobby?.paidSeats ?? 0}/${activeLobby?.seatsTotal ?? 0} paid`,
                helper: 'Wallet + TON client confirm each payment.',
              },
              {
                label: 'Seed reveal',
                value: activeLobby?.seedReveal ?? 'Pending',
                helper: 'Revealed when the round finalizes.',
              },
              {
                label: 'Winner calculation',
                value: activeLobby?.roundHash ? 'round_hash % seats' : 'Pending',
                helper: 'Transparent modulo selection.',
              },
            ].map((step) => (
              <Box
                key={step.label}
                borderWidth="1px"
                borderColor="whiteAlpha.200"
                borderRadius="lg"
                p={3}
                bg="rgba(9,12,22,0.7)"
              >
                <Text fontWeight="bold">{step.label}</Text>
                <Text fontFamily="mono" fontSize="sm" mt={2} noOfLines={2}>
                  {step.value}
                </Text>
                <Text fontSize="sm" color="gray.400" mt={2}>
                  {step.helper}
                </Text>
              </Box>
            ))}
          </Grid>
        </PageSection>
      </Grid>
    </Stack>
  );
}

function SeatRow({ seat }: { seat: LobbySeat }) {
  const statusToneMap: Record<LobbySeat['status'], string> = {
    paid: 'brand.300',
    pending_payment: 'yellow.300',
    taken: 'orange.300',
    failed: 'red.300',
    free: 'gray.400',
  };
  const statusTone = statusToneMap[seat.status] ?? 'gray.500';

  return (
    <Box
      borderWidth="1px"
      borderColor="whiteAlpha.200"
      borderRadius="lg"
      p={3}
      bg="rgba(11,15,24,0.7)"
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap={4}
      flexWrap="wrap"
    >
      <VStack align="flex-start" spacing={1} minW={0}>
        <HStack spacing={2}>
          <Box w="8px" h="8px" borderRadius="full" bg={statusTone ?? 'gray.500'} boxShadow="0 0 0 4px rgba(79,216,255,0.08)" />
          <Text fontWeight="semibold" fontSize="sm">
            Seat #{seat.seatIndex + 1}
          </Text>
        </HStack>
        <Text fontSize="xs" color="gray.400" noOfLines={1}>
          {seat.userId ? `Wallet ${seat.userId.slice(0, 6)}…` : 'Awaiting participant'}
        </Text>
      </VStack>
      <StatusBadge status={seat.status as any} />
    </Box>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <HStack
      spacing={2}
      px={3}
      py={2}
      borderRadius="lg"
      borderWidth="1px"
      borderColor="whiteAlpha.200"
      bg="rgba(10,14,24,0.7)"
    >
      <Text fontSize="xs" color="gray.400">
        {label}
      </Text>
      <Text fontSize="sm" fontWeight="semibold">
        {value}
      </Text>
    </HStack>
  );
}
