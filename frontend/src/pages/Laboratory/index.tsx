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
} from '@chakra-ui/react';
import { PageSection } from '../../components/PageSection';
import { useMockRounds } from '../../hooks/useMockRounds';
import { StatusBadge } from '../../components/StatusBadge';

export default function LaboratoryPage() {
  const rounds = useMockRounds();

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
    </Stack>
  );
}
