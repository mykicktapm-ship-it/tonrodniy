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
      return `Место #${seat.seatIndex + 1} оплачено`;
    case 'pending_payment':
      return `Место #${seat.seatIndex + 1} ждёт подтверждения`;
    case 'taken':
      return `Место #${seat.seatIndex + 1} забронировано`;
    case 'failed':
      return `Место #${seat.seatIndex + 1} ошибка оплаты`;
    default:
      return `Место #${seat.seatIndex + 1} свободно`;
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

  const [selectedLobbyId, setSelectedLobbyId] = useState<string | null>(null);

  useEffect(() => {
    if (!lobbies?.length || selectedLobbyId) {
      return;
    }
    const firstActive = lobbies.find((lobby) => lobby.status !== 'archived') ?? lobbies[0];
    if (firstActive) {
      setSelectedLobbyId(firstActive.id);
    }
  }, [lobbies, selectedLobbyId]);

  const activeLobby = useMemo(() => {
    if (!lobbies?.length) {
      return undefined;
    }
    if (selectedLobbyId) {
      const selected = lobbies.find((lobby) => lobby.id === selectedLobbyId);
      if (selected) {
        return selected;
      }
    }
    return lobbies.find((lobby) => lobby.status !== 'archived') ?? lobbies[0];
  }, [lobbies, selectedLobbyId]);

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
        return 'Ожидаем подпись в кошельке…';
      case 'submitted':
        return lastTxHash
          ? `Отправлено ${lastTxHash.slice(0, 10)}…, ждём подтверждение в TON.`
          : 'Транзакция отправлена, ждём подтверждение в TON.';
      case 'rejected':
        return 'Подпись отклонена в кошельке.';
      case 'error':
        return 'Оплата не ушла в сеть TON.';
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
    return typeof userError === 'string' ? userError : 'Не удалось получить профиль кошелька';
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

  const handleReserveSeat = useCallback(async (targetLobby?: LobbySummary) => {
    const lobby = targetLobby ?? activeLobby;
    if (!lobby) {
      return;
    }
    const hasWallet = await requireWalletConnection();
    if (!hasWallet || !userProfile?.id) {
      if (userStatus === 'success' && !userProfile?.id) {
        toast({
          title: 'Кошелёк не привязан',
          description: 'С этим адресом ещё нет TONRODY профиля.',
          status: 'warning',
          duration: 6000,
          isClosable: true
        });
      }
      return;
    }
    try {
      await joinMutation.mutateAsync({ lobbyId: lobby.id, userId: userProfile.id });
      toast({
        title: 'Место забронировано',
        description: 'Закончите оплату до завершения таймера.',
        status: 'success',
        duration: 4000,
        isClosable: true
      });
    } catch (error) {
      toast({
        title: 'Не удалось забронировать место',
        description: error instanceof Error ? error.message : 'Неизвестная ошибка',
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
        title: 'TonConnect недоступен',
        description: 'Контроллер кошелька ещё не готов.',
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
        title: confirmed ? 'Ставка подтверждена' : 'Ставка отправлена',
        description: confirmed ? `TX ${txHash.slice(0, 10)}…` : 'Ждём подтверждения TON…',
        status: confirmed ? 'success' : 'info',
        duration: confirmed ? 5000 : 4000,
        isClosable: true
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      const rejected = /reject/i.test(message);
      setStakeUiState(rejected ? 'rejected' : 'error');
      toast({
        title: rejected ? 'Подпись отклонена' : 'Оплата не прошла',
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
  const progressValue = activeLobby && activeLobby.seatsTotal
    ? Math.min(100, (activeLobby.paidSeats / activeLobby.seatsTotal) * 100)
    : 0;

  return (
    <Stack spacing={6}>
      <Box
        borderWidth="1px"
        borderColor="whiteAlpha.200"
        borderRadius="2xl"
        bg="linear-gradient(160deg, rgba(11,14,24,0.9), rgba(5,7,12,0.94))"
        p={{ base: 5, md: 6 }}
        position="relative"
        overflow="hidden"
      >
        <Box
          position="absolute"
          inset={0}
          bgGradient="radial(at 85% 12%, rgba(79,216,255,0.18), transparent 45%)"
          opacity={0.9}
        />
        <Stack spacing={4} position="relative" zIndex={1}>
          <HStack spacing={3} align="center">
            <Badge colorScheme="cyan" borderRadius="full" px={3} py={1} textTransform="uppercase" fontWeight="700">
              Активное лобби
            </Badge>
            <Text fontSize="xs" color="gray.400">
              Макет собран по docs/lobbies.html
            </Text>
          </HStack>
          {isLobbiesLoading ? (
            <Skeleton height="32px" />
          ) : activeLobby ? (
            <Stack spacing={4}>
              <Text fontSize="xl" fontWeight="bold" letterSpacing="0.01em">
                {activeLobby.lobbyCode ?? 'Лобби'} • {activeLobby.stake} TON
              </Text>
              <HStack spacing={2} flexWrap="wrap">
                <MetaChip label="Режим" value={activeLobby.class?.toUpperCase() ?? 'CLASSIC'} />
                <MetaChip label="Мест занято" value={`${activeLobby.paidSeats}/${activeLobby.seatsTotal}`} />
                <MetaChip label="round_hash" value={(activeLobby.roundHash ?? '—').slice(0, 14) + '…'} />
                <MetaChip label="round_wallet" value={TON_CONTRACT_ADDRESS.slice(0, 14) + '…'} />
              </HStack>
              <Progress value={progressValue} size="sm" colorScheme="cyan" borderRadius="full" bg="whiteAlpha.200" />
              <Flex gap={3} wrap="wrap">
                <Button
                  onClick={() => handleReserveSeat(activeLobby)}
                  isDisabled={isReserveDisabled}
                  isLoading={joinMutation.isPending}
                >
                  Войти в раунд
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePayStake}
                  isDisabled={isPayDisabled}
                  isLoading={payMutation.isPending}
                >
                  Оплатить ставку
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
                  Commit → Reveal защищено
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
            <Text color="gray.400">Пока нет активных лобби.</Text>
          )}
        </Stack>
      </Box>

      <Grid templateColumns={{ base: '1fr', xl: '1.2fr 0.8fr' }} gap={4} alignItems="start">
        <PageSection
          title="Лобби"
          description="Каждая строка повторяет верстку из docs/lobbies.html с шансом, статусом и CTA."
        >
          {isLobbiesLoading ? (
            <Stack spacing={3}>
              <Skeleton height="76px" />
              <Skeleton height="76px" />
            </Stack>
          ) : lobbies?.length ? (
            <Stack spacing={3}>
              {lobbies.map((lobby) => (
                <LobbyRow
                  key={lobby.id}
                  lobby={lobby}
                  isActive={lobby.id === activeLobby?.id}
                  onSelect={(id) => setSelectedLobbyId(id)}
                  onPrimary={() => handleReserveSeat(lobby)}
                />
              ))}
            </Stack>
          ) : (
            <Text color="gray.500">Лобби ещё не созданы.</Text>
          )}
        </PageSection>

        <PageSection
          title="Честность раунда"
          description="Commit → collect → reveal. Проверяйте хеши прямо из TON."
        >
          <Grid templateColumns={{ base: '1fr', sm: 'repeat(2, 1fr)' }} gap={3}>
            {[
              { label: 'Seed commit', value: activeLobby?.seedCommit ?? '—', helper: 'Публикуется до старта.' },
              {
                label: 'Оплачено мест',
                value: `${activeLobby?.paidSeats ?? 0}/${activeLobby?.seatsTotal ?? 0}`,
                helper: 'TON Connect подтверждает каждую ставку.',
              },
              {
                label: 'Seed reveal',
                value: activeLobby?.seedReveal ?? 'Ждём финализации',
                helper: 'Раскрывается при завершении.',
              },
              {
                label: 'Winner formula',
                value: activeLobby?.roundHash ? 'round_hash % seats' : 'Ожидается',
                helper: 'Прозрачный выбор победителя.',
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

      <Grid templateColumns={{ base: '1fr', lg: '1.1fr 0.9fr' }} gap={4} alignItems="start">
        <PageSection
          title="Список мест"
          description="Телеметрия мест и статусы оплаты в том же стиле, что и mock."
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
            <Text color="gray.500">Нет мест для отображения.</Text>
          )}
        </PageSection>

        <Stack spacing={4}>
          <PageSection
            title="Хеш раунда"
            description="round_hash из TON, используем для аудита и выбора победителя."
          >
            <Stat>
              <StatLabel color="gray.400">Commit hash</StatLabel>
              <StatNumber fontSize="lg" fontFamily="mono" wordBreak="break-all">
                {activeLobby?.roundHash ?? '—'}
              </StatNumber>
              <Text fontSize="sm" color="gray.400" mt={3}>
                Контракт {TON_CONTRACT_ADDRESS.slice(0, 18)}… закрепляет commit. Скопируйте значение для проверки при reveal.
              </Text>
            </Stat>
          </PageSection>

          <PageSection title="Пульс" description="События брони и оплаты из активного лобби.">
            {activityFeed.length === 0 ? (
              <Text color="gray.500">Пока нет активности.</Text>
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
        </Stack>
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
            Место #{seat.seatIndex + 1}
          </Text>
        </HStack>
        <Text fontSize="xs" color="gray.400" noOfLines={1}>
          {seat.userId ? `Кошелёк ${seat.userId.slice(0, 6)}…` : 'Ожидаем участника'}
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

function LobbyRow({
  lobby,
  isActive,
  onSelect,
  onPrimary,
}: {
  lobby: LobbySummary;
  isActive: boolean;
  onSelect: (id: string) => void;
  onPrimary: () => void;
}) {
  const status = getLobbyStatusMeta(lobby);
  const chanceText = lobby.seatsTotal ? `~${Math.max(1, Math.round(100 / lobby.seatsTotal))}%` : '—';
  const etaText = lobby.status === 'running' ? 'идёт' : lobby.paidSeats >= lobby.seatsTotal ? 'стартуем' : 'ждём игроков';

  return (
    <Box
      borderWidth="1px"
      borderColor={isActive ? 'brand.400' : 'whiteAlpha.200'}
      borderRadius="lg"
      bg="rgba(11,15,24,0.85)"
      p={3}
      cursor="pointer"
      transition="all 0.15s ease"
      boxShadow={isActive ? '0 0 12px rgba(79,216,255,0.35)' : 'none'}
      onClick={() => onSelect(lobby.id)}
      _hover={{ borderColor: 'brand.400', transform: 'translateY(-1px)' }}
    >
      <Grid templateColumns={{ base: '1fr', sm: '1.7fr 1.3fr' }} gap={3} alignItems="center">
        <Box>
          <Text fontSize="sm" fontWeight="semibold" mb={1} noOfLines={1}>
            Раунд • {lobby.stake} TON
          </Text>
          <HStack spacing={2} flexWrap="wrap" color="gray.400" fontSize="xs">
            <Badge variant="outline" borderRadius="full" borderColor="whiteAlpha.300" color="gray.300" px={2} py={1}>
              {lobby.class?.toUpperCase() ?? 'CLASSIC'}
            </Badge>
            <Text>Игроков: {lobby.paidSeats}/{lobby.seatsTotal}</Text>
            <HStack spacing={1}>
              <Box w="7px" h="7px" borderRadius="full" bg={status.dotColor} boxShadow={`0 0 8px ${status.glow}`} />
              <Text>{status.label}</Text>
            </HStack>
          </HStack>
        </Box>
        <Flex direction="column" align="flex-end" gap={2}>
          <Button
            onClick={(event) => {
              event.stopPropagation();
              onSelect(lobby.id);
              onPrimary();
            }}
            variant="outline"
            size="sm"
            w="full"
            maxW="160px"
            px={4}
            py={3}
            borderRadius="full"
            fontSize="xs"
            letterSpacing="0.05em"
          >
            {lobby.status === 'running' ? 'Смотреть' : 'Войти'}
          </Button>
          <Text fontSize="xs" color="gray.300">
            шанс <Text as="span" color="white">{chanceText}</Text>
          </Text>
          <Text fontSize="xs" color="gray.500">
            до старта: {etaText}
          </Text>
        </Flex>
      </Grid>
    </Box>
  );
}

function getLobbyStatusMeta(lobby: LobbySummary) {
  const fill = lobby.seatsTotal ? lobby.paidSeats / lobby.seatsTotal : 0;
  const mode: 'filling' | 'almost' | 'running' =
    lobby.status === 'running' || lobby.status === 'finalizing' ? 'running' : fill >= 0.7 ? 'almost' : 'filling';

  if (mode === 'running') {
    return { label: 'раунд в процессе', dotColor: '#ff4f6a', glow: 'rgba(255,79,106,0.9)' };
  }
  if (mode === 'almost') {
    return { label: 'почти готово', dotColor: '#ffd75a', glow: 'rgba(255,215,90,0.9)' };
  }
  return { label: 'собираем игроков', dotColor: '#4eff9d', glow: 'rgba(78,255,157,0.9)' };
}
