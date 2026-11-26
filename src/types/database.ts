export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      composer_relations: {
        Row: {
          created_at: string;
          description: string | null;
          id: number;
          relation_type: string;
          source_composer_id: number;
          strength: number;
          target_composer_id: number;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: never;
          relation_type: string;
          source_composer_id: number;
          strength?: number;
          target_composer_id: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: never;
          relation_type?: string;
          source_composer_id?: number;
          strength?: number;
          target_composer_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "composer_relations_source_composer_id_fkey";
            columns: ["source_composer_id"];
            isOneToOne: false;
            referencedRelation: "composers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "composer_relations_target_composer_id_fkey";
            columns: ["target_composer_id"];
            isOneToOne: false;
            referencedRelation: "composers";
            referencedColumns: ["id"];
          },
        ];
      };
      composers: {
        Row: {
          avatar_url: string | null;
          birth_place: string | null;
          birth_year: number;
          created_at: string;
          death_year: number | null;
          era: string;
          full_name: string;
          id: number;
          imslp_synced_at: string | null;
          imslp_url: string | null;
          name: string;
          nationality: string;
          notable_for: string | null;
          rank_order: number | null;
          search_vector: unknown;
          short_bio: string;
          slug: string;
          sort_name: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          birth_place?: string | null;
          birth_year: number;
          created_at?: string;
          death_year?: number | null;
          era: string;
          full_name: string;
          id?: never;
          imslp_synced_at?: string | null;
          imslp_url?: string | null;
          name: string;
          nationality: string;
          notable_for?: string | null;
          rank_order?: number | null;
          search_vector?: unknown;
          short_bio: string;
          slug: string;
          sort_name: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          birth_place?: string | null;
          birth_year?: number;
          created_at?: string;
          death_year?: number | null;
          era?: string;
          full_name?: string;
          id?: never;
          imslp_synced_at?: string | null;
          imslp_url?: string | null;
          name?: string;
          nationality?: string;
          notable_for?: string | null;
          rank_order?: number | null;
          search_vector?: unknown;
          short_bio?: string;
          slug?: string;
          sort_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          footer_note: string;
          hero_badge: string;
          hero_subtitle: string;
          hero_title: string;
          id: number;
          site_name: string;
          site_tagline: string;
          updated_at: string;
        };
        Insert: {
          footer_note?: string;
          hero_badge?: string;
          hero_subtitle?: string;
          hero_title?: string;
          id?: number;
          site_name?: string;
          site_tagline?: string;
          updated_at?: string;
        };
        Update: {
          footer_note?: string;
          hero_badge?: string;
          hero_subtitle?: string;
          hero_title?: string;
          id?: number;
          site_name?: string;
          site_tagline?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      work_movements: {
        Row: {
          created_at: string;
          duration_seconds: number | null;
          id: number;
          key_signature: string | null;
          movement_number: number;
          tempo_marking: string | null;
          title: string;
          work_id: number;
        };
        Insert: {
          created_at?: string;
          duration_seconds?: number | null;
          id?: never;
          key_signature?: string | null;
          movement_number: number;
          tempo_marking?: string | null;
          title: string;
          work_id: number;
        };
        Update: {
          created_at?: string;
          duration_seconds?: number | null;
          id?: never;
          key_signature?: string | null;
          movement_number?: number;
          tempo_marking?: string | null;
          title?: string;
          work_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "work_movements_work_id_fkey";
            columns: ["work_id"];
            isOneToOne: false;
            referencedRelation: "works";
            referencedColumns: ["id"];
          },
        ];
      };
      works: {
        Row: {
          catalog_display: string | null;
          catalog_number: string | null;
          catalog_system: string | null;
          composer_id: number;
          created_at: string;
          description: string | null;
          duration_minutes: number | null;
          genre: string;
          id: number;
          imslp_synced_at: string | null;
          imslp_url: string | null;
          instrumentation: string | null;
          is_popular: boolean;
          key_signature: string | null;
          movements_count: number | null;
          nickname: string | null;
          search_vector: unknown;
          title: string;
          year_composed: number | null;
        };
        Insert: {
          catalog_display?: string | null;
          catalog_number?: string | null;
          catalog_system?: string | null;
          composer_id: number;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number | null;
          genre: string;
          id?: never;
          imslp_synced_at?: string | null;
          imslp_url?: string | null;
          instrumentation?: string | null;
          is_popular?: boolean;
          key_signature?: string | null;
          movements_count?: number | null;
          nickname?: string | null;
          search_vector?: unknown;
          title: string;
          year_composed?: number | null;
        };
        Update: {
          catalog_display?: string | null;
          catalog_number?: string | null;
          catalog_system?: string | null;
          composer_id?: number;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number | null;
          genre?: string;
          id?: never;
          imslp_synced_at?: string | null;
          imslp_url?: string | null;
          instrumentation?: string | null;
          is_popular?: boolean;
          key_signature?: string | null;
          movements_count?: number | null;
          nickname?: string | null;
          search_vector?: unknown;
          title?: string;
          year_composed?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "works_composer_id_fkey";
            columns: ["composer_id"];
            isOneToOne: false;
            referencedRelation: "composers";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      search_catalog: {
        Args: {
          era_filter?: string;
          genre_filter?: string;
          max_results?: number;
          query_text: string;
        };
        Returns: {
          avatar_url: string | null;
          catalog_display: string | null;
          composer_id: number;
          composer_name: string;
          composer_slug: string;
          era: string;
          genre: string | null;
          id: number;
          result_type: string;
          score: number;
          slug: string;
          subtitle: string | null;
          title: string;
          year_value: number | null;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Composer = Database["public"]["Tables"]["composers"]["Row"];
export type Work = Database["public"]["Tables"]["works"]["Row"];
export type WorkMovement =
  Database["public"]["Tables"]["work_movements"]["Row"];
export type ComposerRelation =
  Database["public"]["Tables"]["composer_relations"]["Row"];
export type SiteSettings =
  Database["public"]["Tables"]["site_settings"]["Row"];
export type SearchCatalogResult =
  Database["public"]["Functions"]["search_catalog"]["Returns"][number];

export type ComposerWithWorkCount = Composer & {
  works: { count: number }[];
};

export type WorkWithComposer = Work & {
  composers: Pick<Composer, "id" | "name" | "slug" | "era" | "nationality" | "avatar_url"> | null;
};
