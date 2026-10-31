/* Reglas de los objetivos de entrenamiento · «Analiza tus goles» (fase 2, textos revisados en v10). EDITABLE POR JOAN.
   Principio: la herramienta ayuda al portero a mejorar; nunca lo culpa. Los textos hablan de contexto y de qué trabajar.
   Cada regla: cuándo se activa (patrón), qué objetivo propone y cómo se mide.
   min = goles mínimos que deben cumplir el patrón (nunca menos de 3); pct = porcentaje mínimo sobre los goles analizados.
   Los penaltis no cuentan. Los objetivos son siempre de un solo portero.
   Campo del gol «¿Cuánto dependía de ti?» (depende): Mucho / En parte / Poco (marca o defensa). Vacío = Mucho.
   - Reglas 'tecnico': ignoran los goles «Poco».
   - Regla 'comunicacion': se activa con 3 o más goles «Poco» de balón parado o centro, o rematados de cabeza.
   Textos: {x} goles del patrón, {n} goles analizados, {lado} izquierda/derecha, {top} valor más repetido. */
window.REGLAS_OBJETIVOS = {
  minGoles: 3,
  maxObjetivos: 3,
  partidosSeguimiento: 3,
  excluirLlegada: ['Penalti'],
  reglas: [
    { id: 'comunicacion-defensa', tipo: 'comunicacion', area: 'Comunicación con la defensa',
      patron: { campo: 'depende', valores: ['Poco'], o: [{ campo: 'llegada', valores: ['Córner', 'Centro lateral', 'Falta'] }, { campo: 'remate', valores: ['Cabeza'] }] }, min: 3, pct: 0,
      titulo: 'Ordenar a la defensa antes de que llegue el balón',
      porque: '{x} de {n} goles se marcaron como «Poco»: llegaron a balón parado, de centro o de cabeza y dependían sobre todo de la marca y de la organización del equipo.',
      metrica: 'Goles marcados «Poco» a balón parado, de centro o de cabeza, por partido.' },
    { id: 'caida-baja', tipo: 'tecnico', area: 'Caída lateral baja',
      patron: { campo: 'porteria', valores: ['bi', 'bd'], agrupar: true }, min: 3, pct: 30,
      titulo: 'Llegar antes al balón raso al palo',
      porque: '{x} de {n} goles entraron abajo a la {lado}: ahí hay margen para llegar antes.',
      metrica: 'Goles abajo a ese lado por partido.' },
    { id: 'aereo-parado', tipo: 'tecnico', area: 'Juego aéreo en córner y centro',
      patron: { campo: 'llegada', valores: ['Córner', 'Centro lateral'], y: { campo: 'remate', valores: ['Cabeza'] } }, min: 3, pct: 25,
      titulo: 'Dominar el área en los balones colgados',
      porque: '{x} de {n} goles llegaron de córner o centro y se remataron de cabeza, una situación que también depende de las marcas.',
      metrica: 'Goles de córner o centro rematados de cabeza por partido.' },
    { id: 'salir-quedarse', tipo: 'tecnico', area: 'Decisión: salir o quedarte',
      patron: { campo: 'decision', valores: ['Mejorable'] }, min: 3, pct: 30,
      titulo: 'Decidir antes: salir o quedarte',
      porque: 'En {x} de {n} goles la decisión de salir o quedarte se puede afinar{topTxt}. Es algo que se entrena.',
      metrica: 'Goles con la decisión por afinar, por partido.' },
    { id: 'colocacion', tipo: 'tecnico', area: 'Colocación',
      patron: { campo: 'posicion', valores: ['Adelantado', 'Retrasado', 'Desplazado hacia un lateral'], top: true }, min: 3, pct: 25,
      titulo: 'Ajustar la colocación según el balón',
      porque: 'En {x} de {n} goles la colocación de partida era «{top}». Ajustarla te da más opciones de llegar.',
      metrica: 'Goles con la colocación «{top}», por partido.' },
    { id: 'blocaje', tipo: 'tecnico', area: 'Blocaje y segunda jugada',
      patron: { campo: 'tecnicaFallo', valores: ['Blocaje', 'Despeje'] }, min: 3, pct: 15,
      titulo: 'Que el primer balón no deje segunda jugada',
      porque: 'En {x} de {n} goles el balón quedó vivo tras la primera intervención. Trabajarlo ayuda a cortar la segunda jugada.',
      metrica: 'Goles con segunda jugada tras la primera intervención, por partido.' },
    { id: 'pies', tipo: 'tecnico', area: 'Juego de pies en la salida',
      patron: { campo: 'llegada', valores: ['Salida que no salió como quería'] }, min: 3, pct: 10,
      titulo: 'Sacar el balón con más seguridad',
      porque: '{x} de {n} goles nacieron de una salida de balón que no salió como querías. Con más opciones de pase, sale mejor.',
      metrica: 'Goles tras una pérdida en la salida, por partido.' }
  ]
};
