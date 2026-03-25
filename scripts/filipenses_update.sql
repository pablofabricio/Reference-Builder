BEGIN;

UPDATE channels
SET description = 'Serie em 4 semanas por Filipenses, com uma referencia por capitulo e aplicacoes praticas para a igreja.'
WHERE id = 2;

UPDATE "references"
SET title = 'Filipenses - Semana 1 (Capitulo 1)',
  description = 'Semana 1: gratidao, parceria no evangelho e vida digna de Cristo.',
    updated_at = NOW()
WHERE title IN ('Filipenses 1:1', 'Filipenses - Semana 1 (Capitulo 1)');

INSERT INTO "references" (type, title, abbreviation, author, description, created_at, updated_at)
SELECT 'BIBLE', 'Filipenses - Semana 1 (Capitulo 1)', 'FIL-S1', 'Paulo', 'Semana 1: gratidao, parceria no evangelho e vida digna de Cristo.', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "references" WHERE title = 'Filipenses - Semana 1 (Capitulo 1)');

INSERT INTO "references" (type, title, abbreviation, author, description, created_at, updated_at)
SELECT 'BIBLE', 'Filipenses - Semana 2 (Capitulo 2)', 'FIL-S2', 'Paulo', 'Semana 2: humildade de Cristo, servico mutuo e obediencia alegre.', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "references" WHERE title = 'Filipenses - Semana 2 (Capitulo 2)');

INSERT INTO "references" (type, title, abbreviation, author, description, created_at, updated_at)
SELECT 'BIBLE', 'Filipenses - Semana 3 (Capitulo 3)', 'FIL-S3', 'Paulo', 'Semana 3: identidade em Cristo e perseveranca no alvo.', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "references" WHERE title = 'Filipenses - Semana 3 (Capitulo 3)');

INSERT INTO "references" (type, title, abbreviation, author, description, created_at, updated_at)
SELECT 'BIBLE', 'Filipenses - Semana 4 (Capitulo 4)', 'FIL-S4', 'Paulo', 'Semana 4: contentamento, oracao e paz em Cristo.', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "references" WHERE title = 'Filipenses - Semana 4 (Capitulo 4)');

DELETE FROM channel_references WHERE channel_id = 2;

INSERT INTO channel_references (channel_id, reference_id, created_at, updated_at)
SELECT 2, r.id, NOW(), NOW()
FROM "references" r
WHERE r.title IN (
  'Filipenses - Semana 1 (Capitulo 1)',
  'Filipenses - Semana 2 (Capitulo 2)',
  'Filipenses - Semana 3 (Capitulo 3)',
  'Filipenses - Semana 4 (Capitulo 4)'
)
ON CONFLICT (channel_id, reference_id) DO NOTHING;

WITH weekly_refs AS (
  SELECT id FROM "references"
  WHERE title IN (
    'Filipenses - Semana 1 (Capitulo 1)',
    'Filipenses - Semana 2 (Capitulo 2)',
    'Filipenses - Semana 3 (Capitulo 3)',
    'Filipenses - Semana 4 (Capitulo 4)'
  )
)
DELETE FROM notes
WHERE reference_node_id IN (
  SELECT rn.id
  FROM reference_nodes rn
  WHERE rn.reference_id IN (SELECT id FROM weekly_refs)
);

WITH weekly_refs AS (
  SELECT id FROM "references"
  WHERE title IN (
    'Filipenses - Semana 1 (Capitulo 1)',
    'Filipenses - Semana 2 (Capitulo 2)',
    'Filipenses - Semana 3 (Capitulo 3)',
    'Filipenses - Semana 4 (Capitulo 4)'
  )
)
DELETE FROM reference_nodes
WHERE reference_id IN (SELECT id FROM weekly_refs);

WITH r AS (
  SELECT id FROM "references" WHERE title = 'Filipenses - Semana 1 (Capitulo 1)'
), b AS (
  INSERT INTO reference_nodes (type, content, label, reference_id, parent_node_id, position, created_at, updated_at)
  SELECT 'BOOK', 'Filipenses semana 1: introducao do capitulo 1, contexto da carta e parceria no evangelho.', 'Filipenses', id, NULL, 1, NOW(), NOW() FROM r
  RETURNING id, reference_id
), c AS (
  INSERT INTO reference_nodes (type, content, label, reference_id, parent_node_id, position, created_at, updated_at)
  SELECT 'CHAPTER', 'Capitulo 1 destaca gratidao, intercessao e coragem para viver e morrer em Cristo.', 'Filipenses 1', reference_id, id, 1, NOW(), NOW() FROM b
  RETURNING id, reference_id
)
INSERT INTO reference_nodes (type, content, label, reference_id, parent_node_id, position, created_at, updated_at)
SELECT 'VERSE', v.content, v.label, c.reference_id, c.id, v.position, NOW(), NOW()
FROM c
JOIN (
  SELECT
    gs AS position,
    '1.' || gs AS label,
    CASE gs
      WHEN 1 THEN 'Paulo e Timoteo, servos de Cristo Jesus, a todos os santos em Cristo Jesus que estao em Filipos, com os bispos e diaconos.'
      WHEN 2 THEN 'Graca e paz de Deus Pai e do Senhor Jesus Cristo sobre a igreja.'
      WHEN 3 THEN 'Paulo agradece a Deus todas as vezes que se lembra dos filipenses.'
      WHEN 4 THEN 'Suas oracoes por eles sao marcadas por alegria e gratidao.'
      WHEN 5 THEN 'A parceria no evangelho, desde o primeiro dia, e celebrada com carinho.'
      WHEN 6 THEN 'Deus, que iniciou a boa obra, a levara ate a plena consumacao em Cristo.'
      WHEN 7 THEN 'E justo guardar esse povo no coracao, pois participam da mesma graca.'
      WHEN 8 THEN 'Paulo expressa profunda saudade, com o afeto do proprio Cristo.'
      WHEN 9 THEN 'Ele ora para que o amor deles cresca com discernimento e conhecimento.'
      WHEN 10 THEN 'O objetivo e aprovar o que e excelente e viver com sinceridade.'
      WHEN 11 THEN 'Fruto de justica em Cristo glorifica a Deus na vida da igreja.'
      WHEN 12 THEN 'As cadeias de Paulo contribuiram para avancar, e nao travar, o evangelho.'
      WHEN 13 THEN 'Toda a guarda pretoriana soube que sua prisao era por causa de Cristo.'
      WHEN 14 THEN 'Muitos irmaos ganharam ousadia para anunciar a Palavra sem medo.'
      WHEN 15 THEN 'Alguns pregavam por inveja, outros por boa vontade e sinceridade.'
      WHEN 16 THEN 'Uns agiam por ambicao, mas outros por amor ao evangelho.'
      WHEN 17 THEN 'Mesmo com motivacoes confusas, Cristo ainda era anunciado.'
      WHEN 18 THEN 'Por isso Paulo se alegrava e continuaria se alegrando.'
      WHEN 19 THEN 'Pela oracao da igreja e socorro do Espirito, tudo resultaria em livramento.'
      WHEN 20 THEN 'Seu desejo era honrar Cristo no corpo, seja vivendo, seja morrendo.'
      WHEN 21 THEN 'Para Paulo, viver e Cristo; morrer e lucro.'
      WHEN 22 THEN 'Se viver, frutificaria no ministerio; por isso hesitava em escolher.'
      WHEN 23 THEN 'Estar com Cristo era melhor, mas permanecer era necessario para a igreja.'
      WHEN 24 THEN 'Ficar entre eles significava fortalecimento e crescimento da fe.'
      WHEN 25 THEN 'Paulo cria que permaneceria para o progresso e alegria dos irmaos.'
      WHEN 26 THEN 'Assim, a gloria em Cristo seria ampliada na comunhao com eles.'
      WHEN 27 THEN 'A igreja e chamada a viver de modo digno do evangelho.'
      WHEN 28 THEN 'Sem intimidacao diante dos opositores, mantendo firmeza em unidade.'
      WHEN 29 THEN 'Crer em Cristo inclui tambem participar de seus sofrimentos.'
      WHEN 30 THEN 'A mesma luta de Paulo e agora compartilhada pela comunidade.'
    END AS content
  FROM generate_series(1, 30) gs
) AS v ON TRUE;

WITH r AS (
  SELECT id FROM "references" WHERE title = 'Filipenses - Semana 2 (Capitulo 2)'
), b AS (
  INSERT INTO reference_nodes (type, content, label, reference_id, parent_node_id, position, created_at, updated_at)
  SELECT 'BOOK', 'Filipenses semana 2: unidade da igreja pela humildade de Cristo e servico reciproco.', 'Filipenses', id, NULL, 1, NOW(), NOW() FROM r
  RETURNING id, reference_id
), c AS (
  INSERT INTO reference_nodes (type, content, label, reference_id, parent_node_id, position, created_at, updated_at)
  SELECT 'CHAPTER', 'Capitulo 2 chama a igreja para ter o mesmo sentimento de Cristo: humildade, obediencia e testemunho.', 'Filipenses 2', reference_id, id, 1, NOW(), NOW() FROM b
  RETURNING id, reference_id
)
INSERT INTO reference_nodes (type, content, label, reference_id, parent_node_id, position, created_at, updated_at)
SELECT 'VERSE', v.content, v.label, c.reference_id, c.id, v.position, NOW(), NOW()
FROM c
JOIN (
  SELECT
    gs AS position,
    '2.' || gs AS label,
    CASE gs
      WHEN 1 THEN 'Ha consolacao em Cristo, comunhao no Espirito e afeto entre os irmaos.'
      WHEN 2 THEN 'Paulo pede alegria completa por meio de unidade e mesmo sentimento.'
      WHEN 3 THEN 'Nada por vangloria: cada um considere o outro superior a si.'
      WHEN 4 THEN 'Nao olhar apenas para o proprio interesse, mas tambem para o do proximo.'
      WHEN 5 THEN 'A igreja deve cultivar em si o mesmo sentimento de Cristo Jesus.'
      WHEN 6 THEN 'Ele, sendo Deus, nao reteve seus privilegios como vantagem pessoal.'
      WHEN 7 THEN 'Esvaziou-se, assumiu forma de servo e se fez semelhante aos homens.'
      WHEN 8 THEN 'Humilhou-se ate a morte, e morte de cruz.'
      WHEN 9 THEN 'Por isso Deus o exaltou sobremaneira e lhe deu o nome acima de todo nome.'
      WHEN 10 THEN 'Diante de Jesus, todo joelho se dobra nos ceus, na terra e debaixo da terra.'
      WHEN 11 THEN 'Toda lingua confessa que Jesus Cristo e Senhor, para gloria do Pai.'
      WHEN 12 THEN 'Obediencia continua deve marcar a vida da comunidade, com reverencia.'
      WHEN 13 THEN 'Deus opera em nos tanto o querer quanto o realizar segundo sua vontade.'
      WHEN 14 THEN 'Fazer tudo sem murmuracao e sem discussoes destrutivas.'
      WHEN 15 THEN 'Assim a igreja brilha como luzes em meio a uma geracao corrompida.'
      WHEN 16 THEN 'Reter firmemente a Palavra da vida e motivo de alegria apostolica.'
      WHEN 17 THEN 'Paulo se ve como oferta derramada, alegrando-se com a fe deles.'
      WHEN 18 THEN 'A igreja tambem e convidada a alegrar-se junto com ele.'
      WHEN 19 THEN 'Timoteo seria enviado para fortalecer e trazer boas noticias.'
      WHEN 20 THEN 'Ninguem tinha cuidado tao sincero quanto Timoteo por aquela igreja.'
      WHEN 21 THEN 'Muitos buscavam interesses proprios, nao os de Cristo Jesus.'
      WHEN 22 THEN 'Timoteo provou seu valor servindo como filho ao lado de Paulo.'
      WHEN 23 THEN 'Paulo esperava envia-lo assim que sua situacao fosse esclarecida.'
      WHEN 24 THEN 'Confiava no Senhor que em breve tambem iria pessoalmente.'
      WHEN 25 THEN 'Epafrodito foi chamado de irmao, cooperador e companheiro de lutas.'
      WHEN 26 THEN 'Ele tinha saudade da igreja e estava aflito por causa das noticias.'
      WHEN 27 THEN 'Adoeceu gravemente, mas Deus teve misericordia dele e de Paulo.'
      WHEN 28 THEN 'Seu retorno traria alivio e alegria para os filipenses.'
      WHEN 29 THEN 'Recebam-no com honra e alegria no Senhor.'
      WHEN 30 THEN 'Ele quase morreu por causa da obra de Cristo, servindo com entrega.'
    END AS content
  FROM generate_series(1, 30) gs
) AS v ON TRUE;

WITH r AS (
  SELECT id FROM "references" WHERE title = 'Filipenses - Semana 3 (Capitulo 3)'
), b AS (
  INSERT INTO reference_nodes (type, content, label, reference_id, parent_node_id, position, created_at, updated_at)
  SELECT 'BOOK', 'Filipenses semana 3: abandonar confiancas humanas e prosseguir para o alvo em Cristo.', 'Filipenses', id, NULL, 1, NOW(), NOW() FROM r
  RETURNING id, reference_id
), c AS (
  INSERT INTO reference_nodes (type, content, label, reference_id, parent_node_id, position, created_at, updated_at)
  SELECT 'CHAPTER', 'Capitulo 3 confronta justica propria e reforca perseveranca no chamado celestial.', 'Filipenses 3', reference_id, id, 1, NOW(), NOW() FROM b
  RETURNING id, reference_id
)
INSERT INTO reference_nodes (type, content, label, reference_id, parent_node_id, position, created_at, updated_at)
SELECT 'VERSE', v.content, v.label, c.reference_id, c.id, v.position, NOW(), NOW()
FROM c
JOIN (
  SELECT
    gs AS position,
    '3.' || gs AS label,
    CASE gs
      WHEN 1 THEN 'Alegrem-se no Senhor: repetir essa verdade protege a igreja.'
      WHEN 2 THEN 'Cuidado com falsos mestres que distorcem a confianca no evangelho.'
      WHEN 3 THEN 'A verdadeira circuncisao adora em Espirito e gloria-se em Cristo.'
      WHEN 4 THEN 'Se alguem pudesse confiar na carne, Paulo teria motivos abundantes.'
      WHEN 5 THEN 'Ele lista sua heranca religiosa e zelo dentro do judaismo.'
      WHEN 6 THEN 'Quanto a justica legal, era irrepreensivel aos olhos humanos.'
      WHEN 7 THEN 'Mas o que era lucro passou a ser perda por causa de Cristo.'
      WHEN 8 THEN 'Tudo e considerado perda diante do valor incomparavel de conhecer Cristo.'
      WHEN 9 THEN 'A justica buscada agora vem pela fe, nao por merito proprio.'
      WHEN 10 THEN 'Desejo central: conhecer Cristo, seu poder e participar de seus sofrimentos.'
      WHEN 11 THEN 'Esperanca firme na ressurreicao dentre os mortos.'
      WHEN 12 THEN 'Ainda nao alcancei tudo, mas prossigo para conquistar o proposito de Cristo.'
      WHEN 13 THEN 'Uma coisa faco: esquecendo o passado, avancando para frente.'
      WHEN 14 THEN 'Prossigo para o alvo do chamado celestial de Deus em Cristo.'
      WHEN 15 THEN 'Maduros devem pensar assim; Deus corrigira o que faltar em entendimento.'
      WHEN 16 THEN 'Andar segundo a luz que ja foi recebida.'
      WHEN 17 THEN 'Imitem o exemplo apostolico e observem quem vive de forma fiel.'
      WHEN 18 THEN 'Muitos vivem como inimigos da cruz, com coracao preso ao terreno.'
      WHEN 19 THEN 'Seu destino e ruina, seu deus e o proprio ventre, sua gloria e vergonhosa.'
      WHEN 20 THEN 'Nossa cidadania esta nos ceus, de onde aguardamos o Salvador.'
      WHEN 21 THEN 'Cristo transformara nosso corpo humilde para ser conforme sua gloria.'
    END AS content
  FROM generate_series(1, 21) gs
) AS v ON TRUE;

WITH r AS (
  SELECT id FROM "references" WHERE title = 'Filipenses - Semana 4 (Capitulo 4)'
), b AS (
  INSERT INTO reference_nodes (type, content, label, reference_id, parent_node_id, position, created_at, updated_at)
  SELECT 'BOOK', 'Filipenses semana 4: contentamento em qualquer situacao, vida de oracao e mente guardada pela paz de Deus.', 'Filipenses', id, NULL, 1, NOW(), NOW() FROM r
  RETURNING id, reference_id
), c AS (
  INSERT INTO reference_nodes (type, content, label, reference_id, parent_node_id, position, created_at, updated_at)
  SELECT 'CHAPTER', 'Capitulo 4 aplica reconciliacao, alegria, oracao e contentamento pratico no cotidiano.', 'Filipenses 4', reference_id, id, 1, NOW(), NOW() FROM b
  RETURNING id, reference_id
)
INSERT INTO reference_nodes (type, content, label, reference_id, parent_node_id, position, created_at, updated_at)
SELECT 'VERSE', v.content, v.label, c.reference_id, c.id, v.position, NOW(), NOW()
FROM c
JOIN (
  SELECT
    gs AS position,
    '4.' || gs AS label,
    CASE gs
      WHEN 1 THEN 'Permanecam firmes no Senhor, amados irmaos e minha alegria.'
      WHEN 2 THEN 'Evodia e Sintique sao chamadas a viverem em pleno acordo no Senhor.'
      WHEN 3 THEN 'A igreja deve ajudar na reconciliacao e cooperacao no evangelho.'
      WHEN 4 THEN 'Alegrem-se sempre no Senhor; outra vez, alegrem-se.'
      WHEN 5 THEN 'Seja conhecida de todos a bondade e mansidao da comunidade.'
      WHEN 6 THEN 'Nao andem ansiosos; orem com gratidao, apresentando tudo a Deus.'
      WHEN 7 THEN 'A paz de Deus guardara mente e coracao em Cristo Jesus.'
      WHEN 8 THEN 'Fixem o pensamento no que e verdadeiro, justo, puro e louvavel.'
      WHEN 9 THEN 'Pratiquem o que aprenderam; o Deus da paz estara com voces.'
      WHEN 10 THEN 'Paulo se alegra porque o cuidado da igreja floresceu novamente.'
      WHEN 11 THEN 'Aprendeu a viver contente em qualquer circunstancia.'
      WHEN 12 THEN 'Sabia viver em necessidade e em abundancia, em todo tempo.'
      WHEN 13 THEN 'Tudo posso naquele que me fortalece.'
      WHEN 14 THEN 'Ainda assim, os filipenses fizeram bem em participar de sua aflicao.'
      WHEN 15 THEN 'No inicio do evangelho, foram parceiros unicos no sustento missionario.'
      WHEN 16 THEN 'Mesmo em Tessalonica, enviaram ajuda mais de uma vez.'
      WHEN 17 THEN 'Paulo nao busca oferta, mas fruto que cresca na conta deles.'
      WHEN 18 THEN 'O que receberam foi oferta de aroma suave, agradavel a Deus.'
      WHEN 19 THEN 'Deus suprira cada necessidade segundo suas riquezas em gloria.'
      WHEN 20 THEN 'Ao nosso Deus e Pai seja gloria para todo sempre.'
      WHEN 21 THEN 'Saudacoes a todos os santos em Cristo Jesus.'
      WHEN 22 THEN 'Irmaos, inclusive da casa de Cesar, enviam saudacoes.'
      WHEN 23 THEN 'A graca do Senhor Jesus Cristo seja com o espirito de voces.'
    END AS content
  FROM generate_series(1, 23) gs
) AS v ON TRUE;

WITH n AS (
  SELECT r.title AS reference_title, rn.id AS node_id, rn.label
  FROM reference_nodes rn
  JOIN "references" r ON r.id = rn.reference_id
  WHERE r.title IN (
    'Filipenses - Semana 1 (Capitulo 1)',
    'Filipenses - Semana 2 (Capitulo 2)',
    'Filipenses - Semana 3 (Capitulo 3)',
    'Filipenses - Semana 4 (Capitulo 4)'
  )
)
INSERT INTO notes (user_id, content, reference_node_id, visibility, created_at, updated_at)
SELECT x.user_id, x.content, x.node_id, x.visibility, NOW(), NOW()
FROM (
  SELECT 1 AS user_id, 'Aplicacao da semana 1: confiar no processo de Deus e manter parceria fiel no evangelho.'::text AS content,
    (SELECT node_id FROM n WHERE reference_title = 'Filipenses - Semana 1 (Capitulo 1)' AND label = '1.6') AS node_id,
    'CHANNEL'::varchar AS visibility
  UNION ALL
  SELECT 2, 'Observacao de estudo: a alegria em Filipenses nasce da parceria no evangelho, mesmo em contexto de prisao.',
    (SELECT node_id FROM n WHERE reference_title = 'Filipenses - Semana 1 (Capitulo 1)' AND label = '1.5'),
    'CHANNEL'
  UNION ALL
  SELECT 4, 'Aplicacao comunitaria: unidade e firmeza no sofrimento aparecem como sinais de maturidade da igreja.',
    (SELECT node_id FROM n WHERE reference_title = 'Filipenses - Semana 1 (Capitulo 1)' AND label = '1.29'),
    'PUBLIC'
  UNION ALL
  SELECT 2, 'Aplicacao da semana 2: praticar humildade relacional, eliminando disputa e vaidade no servico.',
    (SELECT node_id FROM n WHERE reference_title = 'Filipenses - Semana 2 (Capitulo 2)' AND label = '2.5'),
    'CHANNEL'
  UNION ALL
  SELECT 1, 'Nota de lideranca: obediencia sem murmuracao protege a unidade e fortalece o testemunho da igreja local.',
    (SELECT node_id FROM n WHERE reference_title = 'Filipenses - Semana 2 (Capitulo 2)' AND label = '2.14'),
    'CHANNEL'
  UNION ALL
  SELECT 3, 'Devocional: a entrega de Epafrodito mostra que servico cristao envolve risco, sacrificio e amor pratico.',
    (SELECT node_id FROM n WHERE reference_title = 'Filipenses - Semana 2 (Capitulo 2)' AND label = '2.30'),
    'PUBLIC'
  UNION ALL
  SELECT 3, 'Aplicacao da semana 3: trocar culpa e performance por perseveranca em Cristo e obediencia diaria.',
    (SELECT node_id FROM n WHERE reference_title = 'Filipenses - Semana 3 (Capitulo 3)' AND label = '3.13'),
    'PUBLIC'
  UNION ALL
  SELECT 2, 'Nota pastoral: identidade em Cristo corrige comparacoes e liberta da busca por aprovacao humana.',
    (SELECT node_id FROM n WHERE reference_title = 'Filipenses - Semana 3 (Capitulo 3)' AND label = '3.9'),
    'CHANNEL'
  UNION ALL
  SELECT 1, 'Aplicacao de discipulado: lembrar da cidadania celestial muda prioridades, linguagem e praticas diarias.',
    (SELECT node_id FROM n WHERE reference_title = 'Filipenses - Semana 3 (Capitulo 3)' AND label = '3.20'),
    'CHANNEL'
  UNION ALL
  SELECT 4, 'Aplicacao da semana 4: converter ansiedade em oracao concreta e cultivar contentamento em toda circunstancia.',
    (SELECT node_id FROM n WHERE reference_title = 'Filipenses - Semana 4 (Capitulo 4)' AND label = '4.6'),
    'CHANNEL'
  UNION ALL
  SELECT 3, 'Nota pessoal: contentamento cristao nao e passividade; e confianca ativa na provisao de Deus.',
    (SELECT node_id FROM n WHERE reference_title = 'Filipenses - Semana 4 (Capitulo 4)' AND label = '4.11'),
    'PUBLIC'
  UNION ALL
  SELECT 2, 'Aplicacao financeira: generosidade missionaria e vista por Deus como oferta agradavel e frutifera.',
    (SELECT node_id FROM n WHERE reference_title = 'Filipenses - Semana 4 (Capitulo 4)' AND label = '4.18'),
    'CHANNEL'
) x
WHERE x.node_id IS NOT NULL;

COMMIT;
