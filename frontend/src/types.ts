export type PageStatus = 'active' | 'inactive';

export type ExtraButton = {
  id: string;
  text: string;
  url: string;
};

export type LandingPage = {
  id: string;
  creator_name: string;
  slug: string;
  profile_image_url: string;
  title: string;
  heading: string;
  description: string;
  button1_text: string;
  button1_url: string;
  button2_text: string;
  button2_url: string;
  extra_buttons: ExtraButton[];
  status: PageStatus;
  created_at: string;
  updated_at: string;
};

export type PageDraft = Omit<LandingPage, 'id' | 'created_at' | 'updated_at'>;
