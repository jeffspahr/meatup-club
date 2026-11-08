UPDATE users
SET picture = 'https://avatars.example.test/slow.png'
WHERE email = 'playwright@localhost';

INSERT INTO users (id, email, name, status, picture) VALUES
  (910001, 'slow-one@example.test', 'Slow One', 'active', 'https://avatars.example.test/slow.png'),
  (910002, 'slow-two@example.test', 'Slow Two', 'active', 'https://avatars.example.test/slow.png');
