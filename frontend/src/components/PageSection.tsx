import { Box, Heading, Stack, Text } from '@chakra-ui/react';
import { ReactNode } from 'react';

interface PageSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function PageSection({ title, description, children }: PageSectionProps) {
  return (
    <Box
      borderWidth="1px"
      borderColor="whiteAlpha.200"
      borderRadius="xl"
      bg="linear-gradient(145deg, rgba(12, 18, 30, 0.85), rgba(5, 7, 12, 0.85))"
      boxShadow="0 20px 60px rgba(0,0,0,0.35)"
      p={{ base: 5, md: 6 }}
      overflow="hidden"
      position="relative"
      _before={{
        content: '""',
        position: 'absolute',
        inset: 0,
        bgGradient: 'radial(at 80% 10%, rgba(79,216,255,0.12), transparent 45%)',
        opacity: 0.9,
        pointerEvents: 'none',
      }}
    >
      <Stack spacing={3} position="relative" zIndex={1}>
        <Heading size="md" letterSpacing="0.02em">
          {title}
        </Heading>
        {description ? (
          <Text fontSize="sm" color="gray.400">
            {description}
          </Text>
        ) : null}
        <Box pt={1}>{children}</Box>
      </Stack>
    </Box>
  );
}
