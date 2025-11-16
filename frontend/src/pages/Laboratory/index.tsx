import {
  Alert,
  AlertDescription,
  AlertIcon,
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
import { useTonWallet } from '@tonconnect/ui-react';
import { PageSection } from '../../components/PageSection';
import { useMockRounds } from '../../hooks/useMockRounds';
import { StatusBadge } from '../../components/StatusBadge';
import { ROUND_WALLET_PLACEHOLDER, MOCK_STAKE_TON } from '../../lib/constants';
import { useTonSendTransaction } from '../../hooks/useTonSendTransaction';
import { truncateAddress } from '../../lib/ton';

export default function LaboratoryPage() {
  const rounds = useMockRounds();
  const wallet = useTonWallet();
  const toast = useToast();
  const { sendTransaction, status, error, canSend } = useTonSendTransaction({
    destination: ROUND_WALLET_PLACEHOLDER,
    amountTon: MOCK_STAKE_TON,
    comment: 'TONRODY lab mock stake',
  });

  const handleSendMockTransaction = async () => {
    try {
      await sendTransaction();
      toast({
        title: 'Mock transaction broadcast',
        description: 'When wired to the contract this will move real TON.',
        status: 'success',
      });
    } catch (err) {
      toast({
        title: 'TON Connect transaction failed',
        description: error ?? (err as Error).message,
        status: 'error',
      });
    }
  };

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
          <Button>Simulate funding</Button>
        </VStack>
      </PageSection>

      <PageSection
        title="TON Connect harness"
        description="Use the connected wallet to push a mock stake to the placeholder round wallet."
      >
        <Stack spacing={4}>
          <HStack justify="space-between" align={{ base: 'flex-start', md: 'center' }}>
            <Text color="gray.400">Connected wallet</Text>
            <Text fontFamily="mono">
              {wallet ? truncateAddress(wallet.account.address, 6) : 'No wallet connected'}
            </Text>
          </HStack>
          <HStack justify="space-between">
            <Text color="gray.400">Destination</Text>
            <Text fontFamily="mono" fontSize="sm">
              {truncateAddress(ROUND_WALLET_PLACEHOLDER, 6)}
            </Text>
          </HStack>
          <HStack justify="space-between">
            <Text color="gray.400">Stake preview</Text>
            <Text>{MOCK_STAKE_TON} TON</Text>
          </HStack>
          <Button
            onClick={handleSendMockTransaction}
            isDisabled={!canSend || status === 'pending'}
            isLoading={status === 'pending'}
            loadingText="Sending"
          >
            Send mock transaction
          </Button>
          <Text fontSize="sm" color="gray.400">
            Status: {status}
          </Text>
          {error && (
            <Alert status="error" borderRadius="md" bg="red.900">
              <AlertIcon />
              <AlertDescription fontSize="sm">{error}</AlertDescription>
            </Alert>
          )}
        </Stack>
      </PageSection>
    </Stack>
  );
}
