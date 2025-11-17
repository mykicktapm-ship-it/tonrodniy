import { Box, Button, Grid, HStack, Skeleton, Stack, Text, VStack } from '@chakra-ui/react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { PageSection } from '../../components/PageSection';
import { useRoundQuery, useLobbyQuery } from '../../hooks/useLobbyData';

export default function RoundDetailPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const { data: round, isLoading: isRoundLoading } = useRoundQuery(roundId);
  const { data: lobby, isLoading: isLobbyLoading } = useLobbyQuery(round?.lobbyId);

  const proofCards = [
    { label: 'Round hash', value: round?.roundHash ?? '—' },
    { label: 'Seed commit', value: lobby?.seedCommit ?? '—' },
    { label: 'Seed reveal', value: lobby?.seedReveal ?? 'Pending' }
  ];

  return (
    <Stack spacing={8}>
      <PageSection
        title={`Round ${round?.roundNumber ?? ''}`.trim() || 'Round detail'}
        description="Cryptographic proof of the commit/reveal pipeline."
      >
        {isRoundLoading ? (
          <Skeleton height="200px" />
        ) : round ? (
          <Stack spacing={6}>
            <HStack justify="space-between" align={{ base: 'stretch', md: 'center' }} flexDir={{ base: 'column', md: 'row' }}>
              <VStack align="flex-start" spacing={1}>
                <Text fontSize="lg" fontWeight="bold">
                  Lobby {round.lobbyId}
                </Text>
                <Text color="gray.400" fontSize="sm">
                  Winner wallet: {round.winnerWallet ?? 'Pending'}
                </Text>
                <Text color="gray.400" fontSize="sm">
                  Payout: {round.payoutAmount ? `${round.payoutAmount} TON` : 'TBD'}
                </Text>
                <Text color="gray.400" fontSize="sm">
                  Contract version: {round.contractVersion ?? '—'}
                </Text>
                <Text color="gray.400" fontSize="sm">
                  Finalized at: {round.finalizedAt ?? 'Pending'}
                </Text>
              </VStack>
              <Button as={RouterLink} to="/laboratory" variant="outline">
                Back to Laboratory
              </Button>
            </HStack>
            <GridProof cards={proofCards} loading={isLobbyLoading} />
            <Box borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={4}>
              <Text fontWeight="semibold" mb={3}>
                Transactions
              </Text>
              {round.txHashes.length === 0 ? (
                <Text color="gray.500">No tx hashes recorded yet.</Text>
              ) : (
                <Stack spacing={2}>
                  {round.txHashes.map((hash) => (
                    <Text key={hash} fontFamily="mono" fontSize="sm">
                      {hash}
                    </Text>
                  ))}
                </Stack>
              )}
            </Box>
          </Stack>
        ) : (
          <Text color="red.300">Round not found.</Text>
        )}
      </PageSection>
    </Stack>
  );
}

function GridProof({ cards, loading }: { cards: { label: string; value: string }[]; loading: boolean }) {
  if (loading) {
    return <Skeleton height="150px" />;
  }
  return (
    <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={4}>
      {cards.map((card) => (
        <Box key={card.label} borderWidth="1px" borderColor="whiteAlpha.200" borderRadius="lg" p={4}>
          <Text fontSize="sm" color="gray.500">
            {card.label}
          </Text>
          <Text fontFamily="mono" fontSize="sm" mt={2}>
            {card.value}
          </Text>
        </Box>
      ))}
    </Grid>
  );
}
