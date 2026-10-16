import { Component, OnInit } from '@angular/core';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { MetaverseService } from 'src/app/providers/metaverse.service';

export interface CodeProposal {
  id: string;
  fileName: string;
  title: string;
  author: string;
  code: string;
  votes: number;
  votedByMe: boolean;
  status: 'Approved & Live' | 'Community Voting' | 'Pending Admin Review';
  createdAt: string;
}

@Component({
  selector: 'app-opensource',
  templateUrl: './opensource.page.html',
  styleUrls: ['./opensource.page.scss'],
})
export class OpensourcePage implements OnInit {
  selectedTemplateKey: string = 'land-widget.js';
  customFileName: string = 'land-interactive-widget.js';
  proposalTitle: string = '';
  editorCode: string = '';

  templates: Record<string, { fileName: string; title: string; code: string }> = {
    'land-widget.js': {
      fileName: 'land-interactive-widget.js',
      title: 'Interactive Land Mini-Game & Visitor Counter',
      code: `// FlatMeta Interactive Land Script (runs inside owned square area)
export function onCitizenEnterTile(citizen, tileArea) {
  tileArea.incrementVisitors();
  tileArea.showBanner(\`Welcome @\${citizen.username} to \${tileArea.title}!\`);
  return {
    expression: 'Smile',
    rewardPoints: 10
  };
}`,
    },
    'clan-battle.js': {
      fileName: 'clan-territory-challenge.js',
      title: 'Clan Alliance & Territory Challenge Mini-Game',
      code: `// FlatMeta Clan & Territory Challenge Module
export function challengeNeighbourTile(challenger, defender, squareCoords) {
  const rollA = Math.floor(Math.random() * 100) + challenger.clanBonus;
  const rollB = Math.floor(Math.random() * 100) + defender.defenseWallBonus;
  return {
    winner: rollA >= rollB ? challenger.username : defender.username,
    coords: squareCoords
  };
}`,
    },
    'avatar-pack.ts': {
      fileName: 'avatar-expressions-pack.ts',
      title: 'Smiley-to-Avatar Expression Pack',
      code: `// FlatMeta Smiley Auto-Expression Mapper
export const SMILEY_EXPRESSIONS: Record<string, string> = {
  ':)': 'Smile',
  ':D': 'Twinkle',
  ';)': 'Wink',
  '<3': 'Hearts',
  'B)': 'Cool'
};`,
    },
  };

  roadmapFeatures = [
    {
      title: 'Interactive HTML/JS Land Sandboxes',
      status: 'Active',
      desc: 'Embed custom mini-games, interactive web apps, and Rich HTML inside your owned multi-tile land areas.',
    },
    {
      title: 'Multi-Tile Seamless Image Spanning',
      status: 'Active',
      desc: 'Select any NxM block of squares and slice 1 high-res banner or animated GIF seamlessly with zero grid borders.',
    },
    {
      title: 'Custom 3-Word & /u/ Area URLs',
      status: 'Active',
      desc: 'Assign custom 3-word coordinates (e.g. flatmeta.welcome.home) and shareable /u/slug links to any land parcel.',
    },
    {
      title: 'Clans, Alliances & Territory Mini-Games',
      status: 'Open for PRs',
      desc: 'Build neighbour alliances, property walls, leaderboards, and mini-game challenges on the 2D grid.',
    },
    {
      title: 'Web3 / NFT Land Deed Bridge',
      status: 'Open for PRs',
      desc: 'Optional on-chain minting and smart-contract verification for FlatMeta land deeds.',
    },
  ];

  proposals: CodeProposal[] = [];

  constructor(public general: GeneralService, public meta: MetaverseService, public http: HttpService) {}

  ngOnInit() {
    this.loadTemplate('land-widget.js');
    this.loadProposals();
  }

  loadTemplate(key: string) {
    this.selectedTemplateKey = key;
    const tpl = this.templates[key];
    if (tpl) {
      this.customFileName = tpl.fileName;
      this.proposalTitle = tpl.title;
      this.editorCode = tpl.code;
    }
  }

  onFileUpload(ev: any) {
    const file = ev?.target?.files?.[0];
    if (!file) return;
    this.customFileName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      this.editorCode = String(reader.result || '');
      this.general.presentToast(`Loaded "${file.name}" into the Public Code Editor!`);
    };
    reader.readAsText(file);
  }

  loadProposals() {
    try {
      const raw = localStorage.getItem('flatmeta_code_proposals_v1');
      if (raw) {
        this.proposals = JSON.parse(raw);
      }
    } catch (e) {}

    if (!this.proposals || this.proposals.length === 0) {
      this.proposals = [
        {
          id: 'prop_1',
          fileName: 'multi-tile-seamless-spanner.ts',
          title: 'Zero-gap NxM Canvas Image Slicer for Joined Land Squares',
          author: 'flatmeta_core',
          code: '// Slices 1 uploaded image across selected contiguous squares at zoom 15',
          votes: 42,
          votedByMe: true,
          status: 'Approved & Live',
          createdAt: '2026-10-10',
        },
        {
          id: 'prop_2',
          fileName: 'clan-leaderboard-widget.js',
          title: 'Top Landowners & Friendly Citizens Live Leaderboard Widget',
          author: 'aria_meta',
          code: '// Renders real-time leaderboard of top citizens by squares & connections',
          votes: 19,
          votedByMe: false,
          status: 'Community Voting',
          createdAt: '2026-10-13',
        },
      ];
      this.saveProposals();
    }

    // Also fetch latest community proposals from backend Mini-Git-Lab API
    this.http.get2('CommunityProposals', false).subscribe(
      (res: any) => {
        if (res?.status === true && Array.isArray(res.data?.proposals)) {
          res.data.proposals.forEach((bp: any) => {
            if (!this.proposals.some((lp) => lp.id === bp.id)) {
              this.proposals.push({
                id: bp.id,
                fileName: (bp.category || 'module').toLowerCase().replace(/\s+/g, '-') + '.js',
                title: bp.title,
                author: bp.author || 'citizen',
                code: bp.codeSnippet || bp.description || '',
                votes: Number(bp.votes || 1),
                votedByMe: false,
                status: bp.status === 'Approved' ? 'Approved & Live' : 'Community Voting',
                createdAt: (bp.created_at || new Date().toISOString()).slice(0, 10),
              });
            }
          });
          this.saveProposals();
        }
      },
      () => {}
    );
  }

  saveProposals() {
    try {
      localStorage.setItem('flatmeta_code_proposals_v1', JSON.stringify(this.proposals));
    } catch (e) {}
  }

  submitProposal() {
    if (!this.editorCode || !this.editorCode.trim()) {
      this.general.presentToast('Please write or upload code before committing your proposal.');
      return;
    }
    const prop: CodeProposal = {
      id: 'prop_' + Date.now(),
      fileName: (this.customFileName || 'custom-module.js').trim(),
      title: (this.proposalTitle || 'Community Feature Enhancement').trim(),
      author: this.meta.getCurrentUsername(),
      code: this.editorCode,
      votes: 1,
      votedByMe: true,
      status: 'Community Voting',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    this.proposals = [prop, ...this.proposals];
    this.saveProposals();

    this.http
      .post(
        'SubmitCommunityProposal',
        {
          title: prop.title,
          author: prop.author,
          category: prop.fileName,
          description: prop.title,
          codeSnippet: prop.code,
        },
        false
      )
      .subscribe({ next: () => {}, error: () => {} });

    this.general.presentToast('Committed to Community Code Proposals! Once voted & approved by Admin, it goes live.');
  }

  toggleVote(p: CodeProposal) {
    const delta = p.votedByMe ? -1 : 1;
    if (p.votedByMe) {
      p.votes = Math.max(0, p.votes - 1);
      p.votedByMe = false;
    } else {
      p.votes += 1;
      p.votedByMe = true;
    }
    this.saveProposals();

    this.http.post('VoteCommunityProposal', { id: p.id, delta }, false).subscribe({
      next: () => {},
      error: () => {},
    });
  }
}
