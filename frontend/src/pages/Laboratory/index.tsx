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
import { useCallback, useRef, useState } from 'react';
import { PageSection } from '../../components/PageSection';
import { useMockRounds } from '../../hooks/useMockRounds';
import { StatusBadge } from '../../components/StatusBadge';
import { sendFakeTransaction } from '../../services/fakeTonService';

export default function LaboratoryPage() {
  const rounds = useMockRounds();
  const toast = useToast();
  const toastIdRef = useRef<string | number | undefined>(undefined);
  const [isSending, setIsSending] = useState(false);

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
    </Stack>
  );
}
