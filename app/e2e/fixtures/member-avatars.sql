UPDATE users
SET picture = 'https://avatars.example.test/slow.png'
WHERE email = 'playwright@localhost';

INSERT INTO users (id, email, name, status, picture) VALUES
  (910001, 'slow-one@example.test', 'Slow One', 'active', 'https://avatars.example.test/slow.png'),
  (910002, 'slow-two@example.test', 'Slow Two', 'active', 'https://avatars.example.test/slow.png'),
  (910003, 'slow-3@example.test', 'Slow Member 3', 'active', 'https://avatars.example.test/slow.png'),
  (910004, 'slow-4@example.test', 'Slow Member 4', 'active', 'https://avatars.example.test/slow.png'),
  (910005, 'slow-5@example.test', 'Slow Member 5', 'active', 'https://avatars.example.test/slow.png'),
  (910006, 'slow-6@example.test', 'Slow Member 6', 'active', 'https://avatars.example.test/slow.png'),
  (910007, 'slow-7@example.test', 'Slow Member 7', 'active', 'https://avatars.example.test/slow.png'),
  (910008, 'slow-8@example.test', 'Slow Member 8', 'active', 'https://avatars.example.test/slow.png'),
  (910009, 'slow-9@example.test', 'Slow Member 9', 'active', 'https://avatars.example.test/slow.png');
