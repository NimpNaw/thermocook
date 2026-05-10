"""Logique de saisonnalité des fruits et légumes en France."""

from datetime import datetime
from typing import List

# Dictionnaire des produits de saison par mois (France métropolitaine).
# Les valeurs sont les slugs des ingrédients tels qu'ils sont stockés en base.
SEASONAL_PRODUCE: dict[int, List[str]] = {
    1: [  # Janvier
        "carotte", "poireau", "celeri", "betterave", "panais", "topinambour",
        "chou", "chou-frise", "chou-rouge", "chou-de-bruxelles", "epinard",
        "mache", "endive", "poireaux", "navet", "pomme-de-terre",
        "orange", "mandarine", "citron", "pamplemousse", "kiwi",
        "bar", "cabillaud", "huitres", "moules", "saumon", "truites",
    ],
    2: [  # Février
        "carotte", "poireau", "celeri", "betterave", "panais", "topinambour",
        "chou", "chou-frise", "chou-rouge", "chou-de-bruxelles", "epinard",
        "mache", "endive", "navet", "pomme-de-terre",
        "orange", "mandarine", "citron", "pamplemousse", "kiwi",
        "bar", "cabillaud", "huitres", "moules", "saumon", "truites",
    ],
    3: [  # Mars
        "carotte", "poireau", "celeri", "epinard", "mache", "endive",
        "navet", "pomme-de-terre", "radis", "artichaut",
        "orange", "citron", "kiwi",
        "bar", "cabillaud", "huitres", "saumon", "truites",
    ],
    4: [  # Avril
        "asperge", "radis", "epinard", "poireau", "artichaut",
        "petits-pois", "feve", "laitue", "cresson", "roquette",
        "fraise", "rhubarbe",
        "bar", "daurade", "thon", "truites",
    ],
    5: [  # Mai
        "asperge", "radis", "petits-pois", "feve", "artichaut",
        "laitue", "roquette", "cresson", "courgette",
        "fraise", "rhubarbe", "cerise",
        "bar", "daurade", "thon", "truites",
    ],
    6: [  # Juin
        "courgette", "tomate", "concombre", "poivron", "haricot-vert",
        "petits-pois", "artichaut", "fenouil", "ail", "oignon",
        "fraise", "cerise", "framboise", "abricot", "peche", "groseille",
        "sardines", "thon", "truites", "homard", "langoustines",
    ],
    7: [  # Juillet
        "tomate", "courgette", "poivron", "concombre", "haricot-vert",
        "aubergine", "fenouil", "ail", "oignon", "echalote",
        "mais", "chou-fleur",
        "fraise", "framboise", "abricot", "peche", "nectarine",
        "melon", "pastèque", "groseille", "myrtille", "mirabelle",
        "sardines", "thon", "truites", "homard", "langoustines",
    ],
    8: [  # Août
        "tomate", "courgette", "poivron", "concombre", "haricot-vert",
        "aubergine", "fenouil", "mais", "oignon", "echalote",
        "chou-fleur", "brocoli",
        "framboise", "peche", "nectarine", "melon", "pastèque",
        "myrtille", "mirabelle", "prune", "figue",
        "sardines", "thon", "truites", "homard", "langoustines", "moules",
    ],
    9: [  # Septembre
        "tomate", "poivron", "aubergine", "courgette", "haricot-vert",
        "brocoli", "chou-fleur", "celeri", "fenouil", "mais",
        "champignon", "potiron", "courge", "butternut",
        "pomme", "poire", "raisin", "figue", "prune", "mure",
        "sardines", "thon", "truites", "moules",
    ],
    10: [  # Octobre
        "carotte", "betterave", "celeri", "poireau", "navet",
        "brocoli", "chou-fleur", "chou", "epinard", "mache",
        "potiron", "courge", "butternut", "champignon", "endive",
        "pomme", "poire", "raisin", "coing", "chataigne",
        "bar", "cabillaud", "huitres", "moules",
    ],
    11: [  # Novembre
        "carotte", "betterave", "celeri", "poireau", "navet", "panais",
        "chou", "chou-frise", "chou-de-bruxelles", "epinard", "mache", "endive",
        "potiron", "courge", "champignon", "topinambour",
        "pomme", "poire", "coing", "chataigne", "kiwi",
        "bar", "cabillaud", "huitres", "moules",
    ],
    12: [  # Décembre
        "carotte", "betterave", "celeri", "poireau", "navet", "panais",
        "chou", "chou-frise", "chou-rouge", "chou-de-bruxelles",
        "epinard", "mache", "endive", "topinambour",
        "orange", "mandarine", "citron", "pamplemousse", "kiwi", "coing",
        "bar", "cabillaud", "huitres", "moules",
    ],
}


def get_current_seasonal_slugs(month: int | None = None) -> List[str]:
    """Retourne la liste des slugs d'ingrédients de saison pour le mois donné
    (par défaut le mois courant)."""
    if month is None:
        month = datetime.now().month
    return SEASONAL_PRODUCE.get(month, [])
